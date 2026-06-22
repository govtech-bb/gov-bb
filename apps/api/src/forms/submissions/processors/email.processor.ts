import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import Handlebars from "handlebars";
import { SesMailer } from "../../../email/ses-mailer";
import { EmailTemplateService } from "../../../email/email-template.service";
import {
  EmailBodyBuilder,
  type EmailFileLink,
} from "../../../email/email-body.builder";
import { FilesService } from "../../../files/files.service";
import {
  classifyRecipientField,
  CONTACT_DETAILS_PREFIX,
} from "@govtech-bb/form-types";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";
import { FormConfigService } from "../../form-config/form-config.service";
import { NonRetryableError } from "./non-retryable-error";

// The detailed reviewer/MDA email: full field-by-field summary of the
// submission. Used for every recipient kind except the citizen.
const CONFIRMATION_TEMPLATE = "submission-confirmation";

// The citizen acknowledgement (the "submitted" recipient): a lightweight
// "we received your submission" with the reference and a short what-happens-next
// note, deliberately omitting the field-by-field dump that the reviewer copy
// carries — email is forwardable and retained, so the applicant's own answers
// don't need to ride along.
const RECEIVED_TEMPLATE = "submission-received";

// SESv2 SendEmail accepts messages up to 40 MB (after base64), but messages
// over 10 MB are bandwidth-throttled. Base64 inflates attachment bytes by
// 4/3, so a 7 MB raw budget (~9.3 MB encoded plus body and MIME framing)
// keeps sends near the throttle-free tier with ample headroom under the hard
// cap. Files beyond the budget are delivered as signed download links in the
// body instead.
const ATTACHMENT_BUDGET_BYTES = 7 * 1024 * 1024;

// TTL for signed download links embedded in the email body. A presigned URL
// is a bearer credential and email is forwardable and retained indefinitely,
// so this is deliberately much shorter than the 7-day upload-flow default —
// long enough to span a weekend before a reviewer opens the notification.
const EMAIL_LINK_TTL_SECONDS = 72 * 60 * 60;

@Injectable()
export class EmailProcessor implements ISubmissionProcessor {
  readonly type = "email" as const;
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly defaultRecipient: string;

  constructor(
    config: ConfigService,
    private readonly mailer: SesMailer,
    private readonly templateService: EmailTemplateService,
    private readonly emailBodyBuilder: EmailBodyBuilder,
    private readonly filesService: FilesService,
    private readonly formConfigService: FormConfigService,
  ) {
    this.defaultRecipient =
      config.get<string>("email.defaultRecipient") ?? "testing@govtech.bb";
  }

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. Defaults to 0 for direct single-entry invocation;
    // production dispatch (listener/consumer) always sets it.
    //
    // Per-entry idempotency is solved by construction: a failed send throws and
    // SQS retries only this entry's message, so a sibling email (e.g. the
    // applicant confirmation vs. an MDA notification) is never re-sent on the
    // other's retry. The single entry can still re-send itself on retry —
    // inherent to SES at-least-once delivery, with no dedup available — which is
    // out of scope here.
    const index = payload.processorIndex ?? 0;
    const entry = payload.processors[index];

    // Defensive: per-entry dispatch never invokes us without a matching entry,
    // but a corrupted/out-of-range index should be a no-op, not a throw.
    if (!entry) return { kind: "completed" };

    const cfg = (entry.config ?? {}) as Record<string, unknown>;

    await this.processEntry(payload, cfg);

    return { kind: "completed" };
  }

  private async processEntry(
    payload: SubmissionCreatedEvent,
    cfg: Record<string, unknown>,
  ): Promise<void> {
    const recipientField = cfg["recipientField"] as string | undefined;
    if (!recipientField) {
      // Config error: a recipe with no recipientField will never succeed on
      // retry, so fail non-retryably.
      throw new NonRetryableError(
        `No recipientField configured for submission ${payload.submissionId}`,
      );
    }

    // Wrap resolution + send so any failure (unresolved recipient or an SES
    // delivery error) throws. The caller surfaces it (SQS retry → DLQ / error
    // log) instead of silently dropping an undelivered email.
    try {
      // Classify once: recipient resolution and the uploads gate below both
      // derive from `kind` so they can never disagree. See classifyRecipientField
      // (@govtech-bb/form-types) for the literal/contact/config/submitted rules.
      const kind = classifyRecipientField(recipientField);

      const recipient =
        kind === "literal"
          ? recipientField
          : kind === "contact"
            ? await this.resolveContactRecipient(payload, recipientField)
            : kind === "config"
              ? await this.resolveConfigRecipient(payload)
              : this.resolveSubmittedRecipient(payload, recipientField);

      if (!recipient) {
        // Config error: the recipient resolved to nothing (e.g. a misconfigured
        // path or an empty contactDetails value). This won't fix itself on
        // retry, so fail non-retryably. NOTE: a resolver that *throws* (DB/infra
        // down) is a transient failure — it propagates to the catch below and is
        // re-wrapped as a normal, retryable error.
        throw new NonRetryableError(
          `Could not resolve recipient at "${recipientField}"`,
        );
      }

      // A recipe can set its own subject; otherwise the default depends on the
      // audience. The citizen ("submitted") gets a generic acknowledgement; the
      // MDA/reviewer gets a notification naming the form (matching the detailed
      // template's heading). resolveContract is cached, so naming the form here
      // costs no extra fetch on the MDA path (uploads/body already resolve it).
      let subject = cfg["subject"] as string | undefined;
      if (!subject) {
        if (kind === "submitted") {
          subject = "Your form submission has been received";
        } else {
          const contract = await this.emailBodyBuilder.resolveContract(
            payload.formId,
            payload.formVersion,
          );
          subject = `A new submission has been received for ${contract.title}`;
        }
      }

      // Uploaded files travel only on MDA/reviewer emails. The citizen
      // confirmation ("submitted" recipient) stays lightweight: the citizen
      // already has their own files.
      const { attachments, fileLinks } =
        kind !== "submitted"
          ? await this.collectUploads(payload)
          : { attachments: [], fileLinks: [] };

      // Citizen ("submitted") gets the lightweight acknowledgement; every
      // other recipient (MDA/reviewer) gets the detailed summary.
      const templateId =
        kind === "submitted" ? RECEIVED_TEMPLATE : CONFIRMATION_TEMPLATE;
      const htmlBody = await this.resolveHtmlBody(
        payload,
        templateId,
        fileLinks,
      );
      const textBody = this.buildTextBody(payload, fileLinks);

      // Content.Simple cannot carry attachments, so sends with attachments
      // switch to a raw MIME message (issue #658). Attachment-free sends keep
      // the simple path unchanged.
      const content =
        attachments.length > 0
          ? {
              Raw: {
                Data: await this.buildRawMessage(
                  recipient,
                  subject,
                  htmlBody,
                  textBody,
                  attachments,
                ),
              },
            }
          : {
              Simple: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: {
                  Text: { Data: textBody, Charset: "UTF-8" },
                  Html: { Data: htmlBody, Charset: "UTF-8" },
                },
              },
            };

      await this.mailer.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.mailer.from,
          Destination: { ToAddresses: [recipient] },
          Content: content,
          // EmailTags are forwarded to the SES event destination (SNS/EventBridge).
          EmailTags: [{ Name: "submissionId", Value: payload.submissionId }],
          ...(this.mailer.configurationSet && {
            ConfigurationSetName: this.mailer.configurationSet,
          }),
        }),
      );

      this.logger.log(
        `[email] Confirmation sent to ${recipient} for submission ${payload.submissionId}`,
      );
    } catch (err) {
      // A config error (unresolved recipient) is non-retryable — rethrow it
      // untouched so the consumer drops the message instead of retrying. Any
      // other failure (SES delivery, resolver/DB exception) is transient: wrap
      // it as a normal error so SQS retries → DLQ.
      if (err instanceof NonRetryableError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to send email for recipientField "${recipientField}" on submission ${payload.submissionId}: ${reason}`,
      );
    }
  }

  /**
   * Resolves a recipient from submitted answer values.
   *
   * recipientField format: "stepId.fieldId". Targeting fields inside a
   * repeatable step is not supported — an array step value yields `undefined`,
   * which the caller treats as an unresolved recipient.
   */
  private resolveSubmittedRecipient(
    payload: SubmissionCreatedEvent,
    recipientField: string,
  ): string | undefined {
    const [stepId, fieldId] = recipientField.split(".");
    const stepValues = payload.values[stepId];
    return stepValues && !Array.isArray(stepValues)
      ? (stepValues[fieldId] as string | undefined)
      : undefined;
  }

  /**
   * Resolves a recipient from the form's service-contract contactDetails
   * (e.g. the MDA notification address). The recipientField after the
   * "contactDetails." prefix names the key to read (today only `email`).
   * Returns `undefined` when the contract has no contactDetails or the
   * requested key is absent/non-string. The caller (`processEntry`) then
   * throws for this entry; `process()` collects the failure and continues so
   * a sibling applicant email still sends (ADR 0006), then re-throws an
   * aggregated error so the unresolved recipient is surfaced, not silently
   * dropped.
   */
  private async resolveContactRecipient(
    payload: SubmissionCreatedEvent,
    recipientField: string,
  ): Promise<string | undefined> {
    const key = recipientField.slice(CONTACT_DETAILS_PREFIX.length);
    const contactDetails =
      await this.emailBodyBuilder.resolveContactDetails(payload);
    const value = contactDetails?.[key as keyof typeof contactDetails];
    return typeof value === "string" ? value : undefined;
  }

  /**
   * Resolves a recipient for the reserved "config.*" token from the
   * per-environment `form_config` → `mda_contact` directory (the private MDA
   * notification address). Always returns a usable address: on a **resolved
   * miss** — no row (e.g. sandbox, or a freshly-migrated recipe with no
   * production row yet), no/deleted contact, or a blank `mda_email` — it
   * degrades to the configured default test inbox rather than a stale
   * production address.
   *
   * A genuine infrastructure failure (DB unreachable) is *not* a resolved miss:
   * it propagates so the send retries (SQS → DLQ) instead of silently
   * misrouting a production MDA notification to the default inbox.
   */
  private async resolveConfigRecipient(
    payload: SubmissionCreatedEvent,
  ): Promise<string> {
    const mdaEmail = await this.formConfigService.resolveMdaEmail(
      payload.formId,
    );
    return mdaEmail ?? this.defaultRecipient;
  }

  /**
   * Gathers the submission's uploaded files for an MDA/reviewer email.
   * Files are attached while their combined raw size stays within
   * ATTACHMENT_BUDGET_BYTES (in submission order); the rest become signed
   * download links so the message never exceeds the SES size limit. A file
   * with unknown size (0) is linked rather than risking the budget.
   *
   * Failures here (contract fetch, S3 download) propagate — the entry fails
   * loudly and the SQS retry path re-attempts, rather than silently sending
   * the notification without the citizen's documents.
   */
  private async collectUploads(payload: SubmissionCreatedEvent): Promise<{
    attachments: Mail.Attachment[];
    fileLinks: EmailFileLink[];
  }> {
    const contract = await this.emailBodyBuilder.resolveContract(
      payload.formId,
      payload.formVersion,
    );
    const entries = FilesService.collectFileEntries(
      FilesService.collectFileFieldsByStep(contract),
      payload.values,
    );

    // Uploaded keys are always issued under the submission's own form prefix
    // (FilesService.buildKey). A submitted key outside it is forged — emailing
    // its bytes (or a signed link) would let a submitter exfiltrate another
    // form's object, so it is skipped entirely, never linked.
    const keyPrefix = `uploads/${payload.formId}/`;

    const attachments: Mail.Attachment[] = [];
    const fileLinks: EmailFileLink[] = [];
    let used = 0;
    for (const entry of entries) {
      if (!entry.key.startsWith(keyPrefix)) {
        this.logger.warn(
          `[email] Skipping file with foreign key ${JSON.stringify(entry.key)} on submission ${payload.submissionId}`,
        );
        continue;
      }
      // entry.size is client-reported, so it only pre-filters files that
      // can't fit; the budget itself is enforced on the actual downloaded
      // byte count — a lying size cannot push the message over the SES limit.
      if (entry.size > 0 && used + entry.size <= ATTACHMENT_BUDGET_BYTES) {
        const content = await this.filesService.getObjectBytes(entry.key);
        if (used + content.length <= ATTACHMENT_BUDGET_BYTES) {
          attachments.push({
            filename: entry.name,
            content,
            contentType: entry.type,
          });
          used += content.length;
          continue;
        }
      }
      fileLinks.push({
        name: entry.name,
        url: await this.filesService.getSignedReadUrl(
          entry.key,
          EMAIL_LINK_TTL_SECONDS,
        ),
      });
    }
    return { attachments, fileLinks };
  }

  /** Builds an RFC 2822 raw message — SES Content.Simple cannot carry
   * attachments, so attachment sends go through Content.Raw. */
  private async buildRawMessage(
    to: string,
    subject: string,
    html: string,
    text: string,
    attachments: Mail.Attachment[],
  ): Promise<Uint8Array> {
    const composer = new MailComposer({
      from: this.mailer.from,
      to,
      subject,
      text,
      html,
      attachments,
    });
    return composer.compile().build();
  }

  /**
   * Builds the HTML body for the confirmation email.
   *
   * Delegates to EmailBodyBuilder (which handles form contract fetching and
   * caching) then renders the given template (`templateId` — the citizen
   * acknowledgement or the detailed reviewer summary, chosen by recipient kind).
   * Falls back to a minimal inline table if either dependency is unavailable
   * or an error is thrown — ensuring the email is always sent.
   */
  private async resolveHtmlBody(
    payload: SubmissionCreatedEvent,
    templateId: string,
    fileLinks: EmailFileLink[] = [],
  ): Promise<string> {
    try {
      const ctx = await this.emailBodyBuilder.build(payload);
      if (fileLinks.length > 0) ctx.fileLinks = fileLinks;
      // Both templates carry the coat-of-arms branding. The department name is
      // only used by the citizen acknowledgement, so resolve that directory
      // lookup only for that template.
      ctx.coatOfArmsUrl = this.mailer.coatOfArmsUrl;
      if (templateId === RECEIVED_TEMPLATE) {
        ctx.departmentName =
          (await this.formConfigService.resolveDepartmentName(
            payload.formId,
          )) ?? undefined;
      }
      const rendered = this.templateService.render(
        templateId,
        ctx as unknown as Record<string, unknown>,
      );
      if (rendered !== null) return rendered;
      this.logger.warn(
        `[email] Template render returned null for "${templateId}"`,
      );
    } catch (err) {
      this.logger.warn(
        `[email] Could not render confirmation template for form "${payload.formId}" — falling back to generic body`,
        err,
      );
    }

    return this.buildHtmlBody(payload, fileLinks);
  }

  private buildTextBody(
    payload: SubmissionCreatedEvent,
    fileLinks: EmailFileLink[] = [],
  ): string {
    const lines = [
      "Your submission has been received.",
      "",
      // referenceCode is required on the event; ?? is defensive for payloads predating the field.
      `Reference: ${payload.referenceCode ?? payload.submissionId}`,
      `Form:      ${payload.formId}`,
      `Submitted: ${payload.meta.submittedAt}`,
    ];
    if (fileLinks.length > 0) {
      lines.push(
        "",
        "Uploaded documents too large to attach (temporary download links):",
        ...fileLinks.map((l) => `- ${l.name}: ${l.url}`),
      );
    }
    return lines.join("\n");
  }

  private buildHtmlBody(
    payload: SubmissionCreatedEvent,
    fileLinks: EmailFileLink[] = [],
  ): string {
    // Citizen-supplied names/URLs are escaped with Handlebars' own escaper —
    // the same one the template path applies automatically.
    const esc = Handlebars.escapeExpression;
    const links =
      fileLinks.length > 0
        ? `\n      <p>Uploaded documents too large to attach (temporary download links):</p>
      <ul>${fileLinks
        .map((l) => `<li><a href="${esc(l.url)}">${esc(l.name)}</a></li>`)
        .join("")}</ul>`
        : "";
    // referenceCode is required on the event; ?? is defensive for payloads predating the field.
    return `
      <p>Your submission has been received.</p>
      <table>
        <tr><th>Reference</th><td>${payload.referenceCode ?? payload.submissionId}</td></tr>
        <tr><th>Form</th><td>${payload.formId}</td></tr>
        <tr><th>Submitted</th><td>${payload.meta.submittedAt}</td></tr>
      </table>${links}
    `.trim();
  }
}
