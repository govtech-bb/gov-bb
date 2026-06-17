import { Injectable } from "@nestjs/common";
import NodeCache from "node-cache";
import MarkdownIt from "markdown-it";
import { DateTime } from "luxon";
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
import {
  resolveStepTitle,
  type StepScopedValues,
} from "@govtech-bb/form-conditions";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import type {
  SubmissionAuditTrail,
  SubmissionCreatedEvent,
  SubmissionPaymentSummary,
} from "../forms/submissions/submissions.types";

/** TTL for cached form contracts (seconds).
 *
 * A specific `formId + version` pair is immutable once published, so the
 * contract will never change for a given cache key. The TTL is a safety net
 * to prevent unbounded memory growth if a large number of distinct form
 * versions are processed over a long server lifetime.
 */
const CONTRACT_CACHE_TTL_SECONDS = 600; // 10 minutes

// Renders the form's authored confirmation markdown to HTML for the citizen
// email. Default options escape raw HTML in the source (html: false) — the
// content is trusted (recipe-authored) but there's no reason to allow inline
// markup, and it keeps the output to the headings/lists/emphasis authors use.
const markdownRenderer = new MarkdownIt();

// Steps suppressed from the notification email, per form. The in-chat
// `chat-feedback` form's declaration is auto-confirmed by the chat on the
// user's behalf — the recipe requires it (and the form-builder regenerates it
// on every republish), but the user never sees or confirms it (ADR 0049).
// Surfacing a "Declaration: I confirm" row the user never actually agreed to
// would be misleading, so it's dropped from the feedback email. Scoped per
// formId: a real application keeps its declaration in the MDA email as an
// audit record that the applicant did confirm it.
const SUPPRESSED_STEPS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["chat-feedback", new Set(["declaration"])],
]);

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
  /** submittedAt split into Barbados-local date (dd/MM/yyyy) and time (HH:mm)
   * for the reviewer/MDA summary table. */
  submittedDate: string;
  submittedTime: string;
  processedAt: string;
  /** Four-digit year of `processedAt`, for the footer copyright line. */
  year: string;
  sections: EmailSection[];
  /** The form's authored confirmation guidance (`markdownContent` on the
   * submission-confirmation step) rendered to HTML — the same copy shown on
   * the live confirmation page. Undefined when the form authors none. Emitted
   * with a triple-stache: the source is trusted, recipe-authored content. */
  markdownHtml?: string;
  /** Set by the email processor, not by `build` — link delivery is a
   * per-recipient decision the builder has no visibility into. */
  fileLinks?: EmailFileLink[];
  /** Set by the email processor (config-derived), not by `build`: the public
   * department name (citizen acknowledgement) and the absolute coat-of-arms
   * image URL. */
  departmentName?: string;
  coatOfArmsUrl?: string;
  /** Confirmed-payment details, forwarded from the post-payment
   * `submission.created` event. Rendered on the MDA/reviewer confirmation
   * email; undefined for non-payment submissions. */
  payment?: SubmissionPaymentSummary;
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
 * - `file`      — uploaded filenames joined with ", " (name falls back to the
 *   key's basename; items without a durable `key` are skipped — the file
 *   bytes are never inlined, only acknowledged by name)
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

    const suppressedSteps = SUPPRESSED_STEPS.get(contract.formId);

    const sections = contract.steps
      .filter((step) => meta.activeStepIds.includes(step.stepId))
      .filter((step) => !meta.hiddenStepIds.includes(step.stepId))
      .filter((step) => !suppressedSteps?.has(step.stepId))
      .flatMap((step) => {
        const rawVal = values[step.stepId];

        // Resolve any per-answer title override (#871) against the submitted
        // values, so the email section header matches the heading the
        // applicant saw while filling in the form. Falls back to the static
        // title for steps without a `conditionalTitle`.
        const stepTitle = resolveStepTitle(step, values as StepScopedValues);

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
                needsIndex ? `${stepTitle} (${i + 1})` : stepTitle,
              ),
            )
            .filter((s) => s.fields.length > 0);
        }

        const section = this.buildSection(
          step,
          (rawVal as Record<string, unknown>) ?? {},
          meta,
          stepTitle,
        );
        return section.fields.length > 0 ? [section] : [];
      });

    // Authored confirmation guidance lives on the submission-confirmation step
    // regardless of step visibility, so read it straight off the contract
    // rather than the filtered `sections` (which only carry answered fields).
    // It's the same markdown the live confirmation page renders; parsing it
    // synchronously (marked.parse returns a string when async isn't enabled)
    // keeps the email copy in step with the page.
    const markdownContent = contract.steps.find(
      (s) => s.stepId === "submission-confirmation",
    )?.markdownContent;
    const markdownHtml = markdownContent
      ? markdownRenderer.render(markdownContent)
      : undefined;

    const processedAt = new Date().toISOString();

    // Reviewer/MDA summary shows the submission moment in Barbados local time
    // (AST, UTC-4, no DST) split into date + time.
    const submitted = DateTime.fromISO(meta.submittedAt, {
      zone: "utc",
    }).setZone("America/Barbados");

    return {
      formTitle: contract.title,
      // referenceCode is required on the event; ?? is defensive for payloads predating the field.
      submissionId: referenceCode ?? submissionId,
      submittedAt: meta.submittedAt,
      submittedDate: submitted.toFormat("dd/MM/yyyy"),
      submittedTime: submitted.toFormat("HH:mm"),
      processedAt,
      year: processedAt.slice(0, 4),
      sections,
      ...(markdownHtml && { markdownHtml }),
      ...(payload.payment && { payment: payload.payment }),
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
    // Optional post-#1196: absent → canonical recipe. (PR B keys the cache on
    // formId alone; until then an absent version keys as `${formId}:`.)
    version?: string,
  ): Promise<ServiceContract> {
    const cacheKey = `${formId}:${version ?? ""}`;
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

    const SKIP_TYPES = new Set<Primitive["htmlType"]>(["show-hide"]);

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

      case "file": {
        // Stored answer is an array of { key, name, size, type } upload items.
        // Mirror FilesService.collectFileEntries: only items with a non-empty
        // string `key` were durably uploaded; display `name`, falling back to
        // the key's basename. Anything else → "" so the row is omitted.
        if (!Array.isArray(raw)) return "";
        return (raw as Array<Record<string, unknown>>)
          .filter(
            (item) => typeof item?.key === "string" && item.key.length > 0,
          )
          .map((item) =>
            typeof item.name === "string" && item.name.length > 0
              ? item.name
              : ((item.key as string).split("/").pop() ?? (item.key as string)),
          )
          .join(", ");
      }

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
