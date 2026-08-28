import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import NodeCache from "node-cache";
import MarkdownIt from "markdown-it";
import { DateTime } from "luxon";
import type {
  ContactDetails,
  FormStep,
  Primitive,
  ServiceContract,
  SubmissionValues,
} from "@govtech-bb/form-types";
import {
  isCompleteDateValue,
  formatDateValue,
} from "@govtech-bb/form-validation";
import {
  resolveFieldLabel,
  resolveStepTitle,
  interpolateConfirmationMarkdown,
  type StepScopedValues,
} from "@govtech-bb/form-conditions";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import { deriveHigherRiskSelection } from "../forms/submissions/derive-higher-risk";
import { isOptionField, resolveOptionDisplay } from "../forms/field-display";
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
    private readonly config: ConfigService,
  ) {}

  async build(payload: SubmissionCreatedEvent): Promise<EmailTemplateContext> {
    const contract = await this.resolveContract(payload.formId);

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
                values as StepScopedValues,
                needsIndex ? `${stepTitle} (${i + 1})` : stepTitle,
              ),
            )
            .filter((s) => s.fields.length > 0);
        }

        const section = this.buildSection(
          step,
          (rawVal as Record<string, unknown>) ?? {},
          meta,
          values as StepScopedValues,
          stepTitle,
        );
        return section.fields.length > 0 ? [section] : [];
      });

    // Derived reviewer signal (#2065): when the form has a checkbox-accordion
    // field, surface whether any higher-risk category was selected so reviewers
    // can decide how the set-up is inspected. Null = the form has no such field,
    // so the section is omitted entirely rather than always reporting "No".
    const higherRisk = deriveHigherRiskSelection(
      contract,
      values as SubmissionValues,
    );
    if (higherRisk !== null) {
      sections.push({
        title: "Higher-risk assessment",
        fields: [
          {
            label: "Higher-risk items selected",
            value: higherRisk ? "Yes" : "No",
          },
        ],
      });
    }

    // Authored confirmation guidance lives on the submission-confirmation step
    // regardless of step visibility, so read it straight off the contract
    // rather than the filtered `sections` (which only carry answered fields).
    // It's the same markdown the live confirmation page renders; parsing it
    // synchronously (marked.parse returns a string when async isn't enabled)
    // keeps the email copy in step with the page.
    const rawMarkdown = contract.steps.find(
      (s) => s.stepId === "submission-confirmation",
    )?.markdownContent;
    // Substitute the resolved polyclinic into the `{polyclinic}` token so the
    // email names the polyclinic the request went to, and the landing origin
    // into `{landingUrl}` so an authored link to a service page is absolute —
    // an email has no base URL, so a root-relative href is simply dead. Shared
    // with the live confirmation page via interpolateConfirmationMarkdown so
    // the email and page copy can't drift (#2201).
    const markdownContent = interpolateConfirmationMarkdown(rawMarkdown, {
      polyclinic: payload.resolvedCatchment?.polyclinic,
      landingUrl: this.config.get<string>("app.landingUrl"),
    });
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
    const contract = await this.resolveContract(payload.formId);
    return contract.contactDetails;
  }

  /**
   * Fetches the form's service contract through the same per-`formId` cache as
   * `build`. Public so the email processor can walk the contract's file fields
   * when gathering upload attachments.
   */
  async resolveContract(formId: string): Promise<ServiceContract> {
    const cached = this.contractCache.get<ServiceContract>(formId);
    if (cached) return cached;

    // Bypass the visibility gate (#2125): this builds the email for an
    // already-created submission, so the published contract must resolve
    // regardless of the form's current visibility (e.g. a draft/preview form).
    // Serves the published recipe only — never the draft DB scratch.
    const contract = await this.formDefinitionsService.findByFormId({
      formId,
      bypassVisibility: true,
    });
    this.contractCache.set(formId, contract);
    return contract;
  }

  private buildSection(
    step: FormStep,
    stepValues: Record<string, unknown>,
    meta: SubmissionAuditTrail,
    allValues: StepScopedValues,
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

    const SKIP_TYPES = new Set<Primitive["htmlType"]>(["show-hide", "content"]);

    const fields = step.elements
      .filter((el) => !SKIP_TYPES.has(el.htmlType))
      // `ui.hidden` fields are machine-written and were never shown to the
      // applicant — in production that is the geocoded routing coordinate. They
      // carry data the CMS payload needs, but printing
      // "Address coordinates: 13.09,-59.57" shows the citizen and the polyclinic
      // a row neither asked for and neither can act on. check-your-answers
      // already filters them the same way (review.tsx).
      .filter((el) => !el.ui?.hidden)
      .filter((el) =>
        activeFieldIds === undefined
          ? true
          : activeFieldIds.includes(el.fieldId),
      )
      .filter((el) => !hiddenFieldIds.includes(el.fieldId))
      .map((el) => ({
        // Resolve any per-answer label override (#2521) the same way the step
        // title is resolved above, so the email names each answer exactly as
        // the applicant was asked for it.
        label: resolveFieldLabel(el, allValues),
        value: this.formatValue(el, stepValues[el.fieldId]),
      }))
      .filter((f) => f.value !== "");

    return { title: titleOverride ?? step.title, fields };
  }

  private formatValue(field: Primitive, raw: unknown): string {
    if (raw === null || raw === undefined || raw === "") return "";

    // Option fields (radio/select/checkbox/checkbox-accordion) resolve value
    // slugs to labels via the shared helper — the same resolution the CMS
    // webhook payload uses (#842) — then render as a comma-joined string.
    if (isOptionField(field)) {
      const display = resolveOptionDisplay(field, raw);
      return Array.isArray(display) ? display.join(", ") : String(display);
    }

    switch (field.htmlType) {
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
        // Multi-value string answers (fieldArray, opening-hours entries)
        // join like every other list in the email — ", ", not the bare
        // comma String() would produce.
        return Array.isArray(raw) ? raw.map(String).join(", ") : String(raw);
    }
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
