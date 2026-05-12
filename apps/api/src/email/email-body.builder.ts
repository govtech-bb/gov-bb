import { Injectable } from "@nestjs/common";
import NodeCache from "node-cache";
import type {
  FormStep,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
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

export interface EmailTemplateContext {
  formTitle: string;
  submissionId: string;
  submittedAt: string;
  processedAt: string;
  sections: EmailSection[];
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

    const { meta, values, submissionId } = payload;

    const sections = contract.steps
      .filter((step) => meta.activeStepIds.includes(step.stepId))
      .filter((step) => !meta.hiddenStepIds.includes(step.stepId))
      .map((step) => this.buildSection(step, values[step.stepId] ?? {}, meta))
      .filter((section) => section.fields.length > 0);

    return {
      formTitle: contract.title,
      submissionId,
      submittedAt: meta.submittedAt,
      processedAt: new Date().toISOString(),
      sections,
    };
  }

  private async resolveContract(
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
  ): EmailSection {
    // When activeFieldIds for a step is absent, default to showing all fields.
    // This keeps new form versions working correctly even if the submission
    // audit trail schema is extended later without recording per-field visibility.
    const activeFieldIds = meta.activeFieldIds[step.stepId];
    const hiddenFieldIds = meta.hiddenFieldIds[step.stepId] ?? [];

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

    return { title: step.title, fields };
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
