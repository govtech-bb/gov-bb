import { Injectable } from "@nestjs/common";
import NodeCache from "node-cache";
import type {
  ContactDetails,
  FormStep,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
import {
  isCompleteDateValue,
  formatDateValue,
} from "@govtech-bb/form-validation";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import type {
  SubmissionAuditTrail,
  SubmissionCreatedEvent,
} from "../forms/submissions/submissions.types";

/** TTL for cached form contracts (seconds).
 *
 * A specific `formId + version` pair is immutable once published, so the
 * contract will never change for a given cache key. The TTL is a safety net
 * to prevent unbounded memory growth if a large number of distinct form
 * versions are processed over a long server lifetime.
 */
const CONTRACT_CACHE_TTL_SECONDS = 600; // 10 minutes

export interface EmailField {
  label: string;
  value: string;
}

export interface EmailSection {
  title: string;
  fields: EmailField[];
}

/** An uploaded file delivered as a signed download link instead of an
 * attachment (e.g. when it would push the message over the SES size limit). */
export interface EmailFileLink {
  name: string;
  url: string;
}

export interface EmailTemplateContext {
  formTitle: string;
  submissionId: string;
  submittedAt: string;
  processedAt: string;
  sections: EmailSection[];
  /** Set by the email processor, not by `build` — link delivery is a
   * per-recipient decision the builder has no visibility into. */
  fileLinks?: EmailFileLink[];
}

/**
 * Builds the rendering context for the generic `submission-confirmation`
 * email template from the submission payload.
 *
 * **Contract caching** — form contracts are fetched from the database once
 * per `formId:version` pair and cached in-process for
 * `CONTRACT_CACHE_TTL_SECONDS`. Because a published version is immutable,
 * the cached value is always correct, making repeated email sends (retries,
 * bulk submissions) cheap.
 *
 * **New forms work automatically** — context is derived entirely from the
 * service contract's steps and field labels, so any form created through the
 * dashboard is supported without code changes.
 *
 * **Field value formatting:**
 * - `radio` / single `select` — option label looked up from `options` list
 * - `checkbox` / multi `select` (`multiple: true`) — selected option labels joined with ", "
 * - `date`      — `{ day, month, year }` object formatted as e.g. "5 June 2026"
 * - `file`      — skipped (binary; not shown in email)
 * - `show-hide` — skipped (layout-only; carries no user data)
 * - all others  — coerced to string
 *
 * **Visibility rules** mirror the form-runner:
 * - Steps absent from `activeStepIds` or in `hiddenStepIds` are omitted
 * - Fields absent from `activeFieldIds[stepId]` (when the key exists) or in
 *   `hiddenFieldIds[stepId]` are omitted
 * - When `activeFieldIds[stepId]` is **undefined** (e.g. future form versions
 *   that don't record per-field visibility) every non-hidden field is shown —
 *   a safe default that avoids silently empty emails
 * - Sections whose every field resolved to an empty value are omitted
 */
@Injectable()
export class EmailBodyBuilder {
  private readonly contractCache = new NodeCache({
    stdTTL: CONTRACT_CACHE_TTL_SECONDS,
  });

  constructor(
    private readonly formDefinitionsService: FormDefinitionsService,
  ) {}

  async build(payload: SubmissionCreatedEvent): Promise<EmailTemplateContext> {
    const contract = await this.resolveContract(
      payload.formId,
      payload.formVersion,
    );

    const { meta, values, submissionId, referenceCode } = payload;

    const sections = contract.steps
      .filter((step) => meta.activeStepIds.includes(step.stepId))
      .filter((step) => !meta.hiddenStepIds.includes(step.stepId))
      .flatMap((step) => {
        const rawVal = values[step.stepId];

        if (Array.isArray(rawVal)) {
          // Repeatable step (V2 submission values) — one section per instance.
          // Number titles only when there is more than one instance so that a
          // single-instance repeatable reads identically to a normal step.
          const needsIndex = rawVal.length > 1;
          return rawVal
            .map((instance, i) =>
              this.buildSection(
                step,
                instance as Record<string, unknown>,
                meta,
                needsIndex ? `${step.title} (${i + 1})` : step.title,
              ),
            )
            .filter((s) => s.fields.length > 0);
        }

        const section = this.buildSection(
          step,
          (rawVal as Record<string, unknown>) ?? {},
          meta,
        );
        return section.fields.length > 0 ? [section] : [];
      });

    return {
      formTitle: contract.title,
      // Prefer the human-readable referenceCode; fall back to the raw UUID for
      // submissions that pre-date the referenceCode feature.
      submissionId: referenceCode ?? submissionId,
      submittedAt: meta.submittedAt,
      processedAt: new Date().toISOString(),
      sections,
    };
  }

  /**
   * Resolves the responsible MDA's `contactDetails` from the form's service
   * contract, reusing the same per-`formId:version` contract cache as `build`.
   *
   * Used by the email processor to deliver to a `contactDetails.*`
   * recipientField (e.g. the MDA notification email) rather than to an address
   * the applicant submitted. Returns `undefined` when the contract carries no
   * `contactDetails` (it is optional) — the caller decides how to handle that.
   */
  async resolveContactDetails(
    payload: SubmissionCreatedEvent,
  ): Promise<ContactDetails | undefined> {
    const contract = await this.resolveContract(
      payload.formId,
      payload.formVersion,
    );
    return contract.contactDetails;
  }

  /**
   * Fetches the form's service contract through the same per-`formId:version`
   * cache as `build`. Public so the email processor can walk the contract's
   * file fields when gathering upload attachments.
   */
  async resolveContract(
    formId: string,
    version: string,
  ): Promise<ServiceContract> {
    const cacheKey = `${formId}:${version}`;
    const cached = this.contractCache.get<ServiceContract>(cacheKey);
    if (cached) return cached;

    const contract = await this.formDefinitionsService.findByFormId({
      formId,
      version,
    });
    this.contractCache.set(cacheKey, contract);
    return contract;
  }

  private buildSection(
    step: FormStep,
    stepValues: Record<string, unknown>,
    meta: SubmissionAuditTrail,
    titleOverride?: string,
  ): EmailSection {
    // When activeFieldIds for a step is absent, default to showing all fields.
    // This keeps new form versions working correctly even if the submission
    // audit trail schema is extended later without recording per-field visibility.
    //
    // V2 audit trails (repeatable steps, PR #156) store per-instance arrays as
    // string[][] instead of string[]. Flatten to a union set so that .includes()
    // works correctly regardless of schema version.
    const rawActive: unknown = meta.activeFieldIds[step.stepId];
    const activeFieldIds: string[] | undefined =
      rawActive === undefined
        ? undefined
        : isNestedArray(rawActive)
          ? [...new Set((rawActive as string[][]).flat())]
          : (rawActive as string[]);

    const rawHidden: unknown = meta.hiddenFieldIds[step.stepId];
    const hiddenFieldIds: string[] =
      rawHidden === undefined
        ? []
        : isNestedArray(rawHidden)
          ? [...new Set((rawHidden as string[][]).flat())]
          : (rawHidden as string[]);

    const SKIP_TYPES = new Set<Primitive["htmlType"]>(["file", "show-hide"]);

    const fields = step.elements
      .filter((el) => !SKIP_TYPES.has(el.htmlType))
      .filter((el) =>
        activeFieldIds === undefined
          ? true
          : activeFieldIds.includes(el.fieldId),
      )
      .filter((el) => !hiddenFieldIds.includes(el.fieldId))
      .map((el) => ({
        label: el.label,
        value: this.formatValue(el, stepValues[el.fieldId]),
      }))
      .filter((f) => f.value !== "");

    return { title: titleOverride ?? step.title, fields };
  }

  private formatValue(field: Primitive, raw: unknown): string {
    if (raw === null || raw === undefined || raw === "") return "";

    switch (field.htmlType) {
      case "radio":
        return (
          field.options?.find((o) => o.value === String(raw))?.label ??
          String(raw)
        );

      case "select": {
        // select[multiple] carries an array of values; single-select carries a scalar.
        if (field.multiple && Array.isArray(raw)) {
          return this.resolveOptionLabels(field.options ?? [], raw);
        }
        return (
          field.options?.find((o) => o.value === String(raw))?.label ??
          String(raw)
        );
      }

      case "checkbox":
        return this.resolveOptionLabels(
          field.options ?? [],
          Array.isArray(raw) ? raw : [raw],
        );

      case "date": {
        if (isCompleteDateValue(raw)) return formatDateValue(raw);
        // Legacy submissions stored ISO strings — pass them through. Any
        // other shape (partial/malformed object) would stringify to
        // "[object Object]", so omit the row instead.
        return typeof raw === "string" ? raw : "";
      }

      default:
        return String(raw);
    }
  }

  private resolveOptionLabels(
    options: Array<{ label: string; value: string }>,
    selected: unknown[],
  ): string {
    return selected
      .map(
        (v) => options.find((o) => o.value === String(v))?.label ?? String(v),
      )
      .join(", ");
  }
}

/**
 * Returns true when `value` is a non-empty array whose first element is also
 * an array — i.e. the `string[][]` shape used by V2 audit trails for repeatable
 * steps.  A plain `string[]` (V1) returns false.
 */
function isNestedArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]);
}
