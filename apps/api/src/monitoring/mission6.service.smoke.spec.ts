import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { migrations } from "@govtech-bb/database";
import { Mission6Service } from "./mission6.service";

// The Mission 6 counting rules live in the SQL, which the unit spec mocks.
// This runs the real queries against Postgres: set DB_HOST etc. to a database
// you can write to (skipped otherwise, like the other smoke specs). It runs
// the package migrations (a no-op where they are already applied), inserts
// rows under a unique form-id prefix, reads only those back, and deletes
// them afterwards.
const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "Mission6Service against Postgres (smoke)",
  () => {
    const prefix = `__smoke-m6-${Date.now()}-`;
    const formA = `${prefix}a`;
    const formB = `${prefix}b`;
    let dataSource: DataSource;
    let service: Mission6Service;

    const submission = async (
      formId: string,
      status: string,
      createdAtUtc: string,
      values: unknown,
    ): Promise<string> => {
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO "form_submissions"
           ("id", "form_id", "status", "values", "created_at", "idempotency_key", "reference_code")
         VALUES ($1::uuid, $2, $3, $4, $5, $1::text, $1::text)`,
        [id, formId, status, JSON.stringify(values), createdAtUtc],
      );
      return id;
    };

    const payment = async (
      formId: string,
      submissionId: string,
      transactions: {
        number: string;
        status: string;
        amount: string;
        settled: string | null;
      }[],
      paymentStatus = "success",
    ) => {
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO "payments"
           ("id", "reference_number", "submission_id", "form_id", "provider",
            "department", "payment_code", "expected_amount", "description", "status")
         VALUES ($1, $1, $2, $3, 'ezpay', 'smoke', 'smoke', 0, 'smoke', $4)`,
        [id, submissionId, formId, paymentStatus],
      );
      for (const t of transactions) {
        await dataSource.query(
          `INSERT INTO "payment_transactions"
             ("payment_id", "transaction_number", "status", "amount", "date_settled")
           VALUES ($1, $2, $3, $4, $5)`,
          [id, t.number, t.status, t.amount, t.settled],
        );
      }
    };

    beforeAll(async () => {
      dataSource = new DataSource({
        type: "postgres",
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT ?? "5432", 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [],
        migrations,
        synchronize: false,
      });
      await dataSource.initialize();
      // The first migration uses uuid_generate_v4(); a fresh database lacks it.
      await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      await dataSource.runMigrations();
      service = new Mission6Service(dataSource, {
        findAll: async () => [],
      } as never);

      const citizen = { you: { email: "a.person@gmail.com" } };
      // Applications, form A. 03:30 UTC on 1 Nov is 23:30 on 31 Oct in
      // Barbados; 04:30 UTC is midnight-thirty on 1 Nov.
      const paid = await submission(
        formA,
        "complete",
        "2026-11-01 03:30",
        citizen,
      );
      await submission(formA, "submitted", "2026-11-01 04:30", citizen);
      await submission(formA, "processing", "2026-11-01 04:30", {
        you: { email: "officer@barbados.gov.bb" },
      });
      // Team tests: a govtech address, and a name whose keys come back in
      // jsonb order (last-name before first-name).
      await submission(formA, "submitted", "2026-11-01 04:30", {
        you: { email: "dev@govtech.bb" },
      });
      await submission(formA, "submitted", "2026-11-01 04:30", {
        you: { "first-name": "John", "last-name": "Doe" },
      });
      // Not applications.
      await submission(formA, "pending_payment", "2026-11-01 04:30", citizen);
      await submission(formA, "draft", "2026-11-01 04:30", citizen);
      await submission(formA, "error", "2026-11-01 04:30", citizen);
      // Repeatable steps (arrays) and a non-object values blob don't break
      // the identity lookup.
      await submission(formB, "submitted", "2026-11-01 04:30", {
        kids: [{ "first-name": "Test" }],
      });
      await submission(formB, "submitted", "2026-11-01 04:30", []);

      // Payments, form A. date_settled is Barbados local time: not shifted.
      await payment(formA, paid, [
        {
          number: `${Date.now()}1`,
          status: "success",
          amount: "10.10",
          settled: "2026-11-01 01:00",
        },
        {
          number: `${Date.now()}2`,
          status: "success",
          amount: "20.20",
          settled: "2026-11-01 02:00",
        },
        {
          number: `${Date.now()}3`,
          status: "failed",
          amount: "99.00",
          settled: "2026-11-01 02:00",
        },
        {
          number: `${prefix}tx-1`,
          status: "success",
          amount: "99.00",
          settled: "2026-11-01 02:00",
        },
        {
          number: `${Date.now()}4`,
          status: "success",
          amount: "99.00",
          settled: null,
        },
      ]);
      // A payment whose submission isn't there is still counted.
      await payment(formA, randomUUID(), [
        {
          number: `${Date.now()}5`,
          status: "success",
          amount: "5.00",
          settled: "2026-11-02 09:00",
        },
      ]);
      // EzPay settled a different amount from the one expected: the payment is
      // 'mismatched' but the money was received, so it counts, with the
      // EzPay amount.
      await payment(
        formA,
        randomUUID(),
        [
          {
            number: `${Date.now()}7`,
            status: "success",
            amount: "2.50",
            settled: "2026-11-04 09:00",
          },
        ],
        "mismatched",
      );
      // A team test's payment is left out.
      const teamPaid = await submission(
        formA,
        "pending_payment",
        "2026-11-01 04:30",
        {
          you: { email: "dev@govtech.bb" },
        },
      );
      await payment(formA, teamPaid, [
        {
          number: `${Date.now()}6`,
          status: "success",
          amount: "7.00",
          settled: "2026-11-03 09:00",
        },
      ]);
    });

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;
      await dataSource.query(
        `DELETE FROM "payment_transactions" WHERE "payment_id" IN
           (SELECT "id" FROM "payments" WHERE "form_id" LIKE $1)`,
        [`${prefix}%`],
      );
      await dataSource.query(`DELETE FROM "payments" WHERE "form_id" LIKE $1`, [
        `${prefix}%`,
      ]);
      await dataSource.query(
        `DELETE FROM "form_submissions" WHERE "form_id" LIKE $1`,
        [`${prefix}%`],
      );
      await dataSource.destroy();
    });

    const ours = <T extends { formId: string }>(rows: T[]) =>
      rows.filter((r) => r.formId.startsWith(prefix));

    it("counts applications by service and Barbados month, tests left out", async () => {
      const r = await service.report();
      expect(ours(r.applications)).toEqual([
        { formId: formA, month: "2026-10", applications: 1, leftOutAsTests: 0 },
        { formId: formA, month: "2026-11", applications: 2, leftOutAsTests: 2 },
        { formId: formB, month: "2026-11", applications: 2, leftOutAsTests: 0 },
      ]);
    });

    it("counts successful numeric settled payments with the BBD total, tests left out", async () => {
      const r = await service.report();
      expect(ours(r.payments)).toEqual([
        {
          formId: formA,
          month: "2026-11",
          payments: 4,
          amountBbd: 37.8,
          leftOutAsTests: 1,
        },
      ]);
    });
  },
);
