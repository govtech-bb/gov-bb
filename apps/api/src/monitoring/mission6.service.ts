import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import {
  isTestApplicant,
  parseNamedTestInboxes,
  type IdentityAnswers,
} from "./mission6-test-rule";

/** One service in one month (Barbados time, `YYYY-MM`). */
export interface Mission6ApplicationsRow {
  formId: string;
  month: string;
  applications: number;
  /** Internal only: how many were left out as team tests. */
  leftOutAsTests: number;
}

export interface Mission6PaymentsRow {
  formId: string;
  month: string;
  payments: number;
  /** Total settled, in BBD, rounded to cents. */
  amountBbd: number;
  /** Internal only: how many payments were left out as team tests. */
  leftOutAsTests: number;
}

export interface Mission6Report {
  generatedAt: string;
  /** formId → the form's title, for every form that appears below. */
  services: Record<string, string>;
  applications: Mission6ApplicationsRow[];
  payments: Mission6PaymentsRow[];
}

// The applicant's identity answers: every answer whose field id mentions
// email or name, keyed "<stepId>.<fieldId>" (top-level answers by field id).
// Only these leave the database, never the full answers.
const IDENTITY_SQL = `(
  select jsonb_object_agg(k, v) from (
    select step.key || '.' || kv.key as k, kv.value as v
    from jsonb_each(case when jsonb_typeof(fs.values) = 'object' then fs.values else '{}'::jsonb end) step
    cross join lateral jsonb_each_text(case when jsonb_typeof(step.value) = 'object' then step.value else '{}'::jsonb end) kv
    where kv.key ~* '(email|name)'
    union all
    select top.key, top.value #>> '{}'
    from jsonb_each(case when jsonb_typeof(fs.values) = 'object' then fs.values else '{}'::jsonb end) top
    where jsonb_typeof(top.value) = 'string' and top.key ~* '(email|name)'
  ) ids
)`;

// Applications: submissions that reached the MDA (submitted, processing or
// complete). Drafts, unpaid and errored submissions are not applications.
// Dated by created_at (when the applicant pressed submit), not submitted_at:
// that is what the September services report used, so the figures stay
// comparable. For a paid form, a citizen who starts on 31 Oct and pays on
// 2 Nov is an October application with a November payment.
// created_at is UTC; Barbados is UTC-4 all year.
const APPLICATIONS_SQL = `
  select fs.form_id as "formId",
         to_char(fs.created_at - interval '4 hours', 'YYYY-MM') as month,
         ${IDENTITY_SQL} as identity
  from form_submissions fs
  where fs.status in ('submitted', 'processing', 'complete')`;

// Payments: successful EzPay transactions with a real (numeric) transaction
// number. The unique index on transaction_number makes each transaction count
// once. A payment EzPay settled for a different amount (payments.status
// 'mismatched') still counts, with the EzPay amount: the money was received,
// and the September services report counted these too. date_settled is EzPay's own Barbados local time, stored as given, so
// it is NOT shifted.
const PAYMENTS_SQL = `
  select p.form_id as "formId",
         to_char(pt.date_settled, 'YYYY-MM') as month,
         pt.amount::text as amount,
         ${IDENTITY_SQL} as identity
  from payment_transactions pt
  join payments p on p.id = pt.payment_id
  left join form_submissions fs on fs.id = p.submission_id
  where pt.status = 'success'
    and pt.transaction_number ~ '^[0-9]+$'
    and pt.date_settled is not null`;

interface ApplicationRow {
  formId: string;
  month: string;
  identity: IdentityAnswers;
}

interface PaymentRow extends ApplicationRow {
  amount: string;
}

const byFormThenMonth = (
  a: { formId: string; month: string },
  b: { formId: string; month: string },
) => a.formId.localeCompare(b.formId) || a.month.localeCompare(b.month);

/**
 * Count-only figures for the Mission 6 reporting page: applications and
 * payments by service and month, with team tests left out. No personal data
 * leaves this service: the identity answers are only used to apply the test
 * rule.
 */
@Injectable()
export class Mission6Service {
  constructor(
    private readonly dataSource: DataSource,
    private readonly formDefinitions: FormDefinitionsService,
  ) {}

  async report(): Promise<Mission6Report> {
    const namedInboxes = parseNamedTestInboxes(
      process.env.TEST_APPLICANT_EMAILS,
    );
    const [appRows, payRows, forms] = await Promise.all([
      this.dataSource.query<ApplicationRow[]>(APPLICATIONS_SQL),
      this.dataSource.query<PaymentRow[]>(PAYMENTS_SQL),
      this.formDefinitions.findAll(true),
    ]);

    const applications = new Map<string, Mission6ApplicationsRow>();
    for (const r of appRows) {
      const key = `${r.formId}|${r.month}`;
      const row = applications.get(key) ?? {
        formId: r.formId,
        month: r.month,
        applications: 0,
        leftOutAsTests: 0,
      };
      if (isTestApplicant(r.identity, namedInboxes)) row.leftOutAsTests++;
      else row.applications++;
      applications.set(key, row);
    }

    const payments = new Map<string, Mission6PaymentsRow & { cents: number }>();
    for (const r of payRows) {
      const key = `${r.formId}|${r.month}`;
      const row = payments.get(key) ?? {
        formId: r.formId,
        month: r.month,
        payments: 0,
        amountBbd: 0,
        leftOutAsTests: 0,
        cents: 0,
      };
      if (isTestApplicant(r.identity, namedInboxes)) {
        row.leftOutAsTests++;
      } else {
        row.payments++;
        row.cents += Math.round(Number(r.amount) * 100);
      }
      payments.set(key, row);
    }

    const titles = new Map(forms.map((f) => [f.formId, f.title]));
    const services: Record<string, string> = {};
    for (const { formId } of [...applications.values(), ...payments.values()]) {
      services[formId] = titles.get(formId) ?? formId;
    }

    return {
      generatedAt: new Date().toISOString(),
      services,
      applications: [...applications.values()].sort(byFormThenMonth),
      payments: [...payments.values()]
        .map(({ cents, ...row }) => ({ ...row, amountBbd: cents / 100 }))
        .sort(byFormThenMonth),
    };
  }
}
