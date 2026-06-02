import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { EmailTemplateService } from "../../../email/email-template.service";
import { EmailBodyBuilder } from "../../../email/email-body.builder";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

const CONFIRMATION_TEMPLATE = "submission-confirmation";

// Reserved recipientField prefix. A recipientField of "contactDetails.<key>"
// resolves against the form's service-contract contactDetails (e.g. the MDA
// notification address) rather than against submitted answer values. A step
// literally named "contactDetails" is therefore shadowed — see
// FORM-CREATION-GUIDE.md.
const CONTACT_DETAILS_PREFIX = "contactDetails.";

@Injectable()
export class EmailProcessor implements ISubmissionProcessor {
  readonly type = "email" as const;
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly client: SESv2Client;
  private readonly from: string;
  private readonly configurationSet: string | undefined;

  constructor(
    config: ConfigService,
    private readonly templateService: EmailTemplateService,
    private readonly emailBodyBuilder: EmailBodyBuilder,
  ) {
    this.from = config.get<string>("email.from") ?? "noreply@gov.bb";
    this.configurationSet = config.get<string>("email.configurationSet");
    this.client = new SESv2Client({
      region: config.get<string>("email.region") ?? "us-east-1",
    });
  }

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    const entries = payload.processors.filter((p) => p.type === "email");

    // Attempt every entry before failing. A per-entry failure (e.g. an
    // unresolvable MDA notification address) must not stop a sibling entry
    // (e.g. the applicant confirmation) from sending — ADR 0006. But failures
    // are no longer swallowed: they are collected here and re-thrown below so
    // the batch fails loudly (SQS retry → DLQ, or an error log on the direct
    // path) instead of silently dropping an undelivered email.
    const failures: string[] = [];
    for (const entry of entries) {
      const cfg = (entry.config ?? {}) as Record<string, unknown>;
      try {
        await this.processEntry(payload, cfg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[email] Entry failed for submission ${payload.submissionId}: ${message}`,
        );
        failures.push(message);
      }
    }

    if (failures.length > 0) {
      // NOTE: email has no per-entry idempotency key, so an SQS retry re-sends
      // already-delivered siblings — a pre-existing gap (ADR 0006), unchanged
      // by this throw (the SES send already threw on delivery failure).
      throw new Error(
        `[email] ${failures.length}/${entries.length} email ` +
          `entr${entries.length === 1 ? "y" : "ies"} failed for submission ` +
          `${payload.submissionId}: ${failures.join("; ")}`,
      );
    }

    return { kind: "completed" };
  }

  private async processEntry(
    payload: SubmissionCreatedEvent,
    cfg: Record<string, unknown>,
  ): Promise<void> {
    const recipientField = cfg["recipientField"] as string | undefined;
    if (!recipientField) {
      throw new Error(
        `No recipientField configured for submission ${payload.submissionId}`,
      );
    }

    // Wrap resolution + send so any failure (unresolved recipient or an SES
    // delivery error) throws. The caller surfaces it (SQS retry → DLQ / error
    // log) instead of silently dropping an undelivered email.
    try {
      // A literal address (contains "@") is used verbatim — this is how a
      // recipe hardcodes a fixed internal recipient (e.g. "testing@govtech.bb").
      // Neither a "contactDetails." prefix nor a "stepId.fieldId" path contains
      // "@", so the literal case is unambiguous and checked first.
      const recipient = recipientField.includes("@")
        ? recipientField
        : recipientField.startsWith(CONTACT_DETAILS_PREFIX)
          ? await this.resolveContactRecipient(payload, recipientField)
          : this.resolveSubmittedRecipient(payload, recipientField);

      if (!recipient) {
        throw new Error(`Could not resolve recipient at "${recipientField}"`);
      }

      const subject =
        (cfg["subject"] as string | undefined) ??
        "Your form submission has been received";

      const htmlBody = await this.resolveHtmlBody(payload);

      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [recipient] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: {
                Text: {
                  Data: this.buildTextBody(payload),
                  Charset: "UTF-8",
                },
                Html: {
                  Data: htmlBody,
                  Charset: "UTF-8",
                },
              },
            },
          },
          // EmailTags are forwarded to the SES event destination (SNS/EventBridge).
          EmailTags: [{ Name: "submissionId", Value: payload.submissionId }],
          ...(this.configurationSet && {
            ConfigurationSetName: this.configurationSet,
          }),
        }),
      );

      this.logger.log(
        `[email] Confirmation sent to ${recipient} for submission ${payload.submissionId}`,
      );
    } catch (err) {
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
   * Builds the HTML body for the confirmation email.
   *
   * Delegates to EmailBodyBuilder (which handles form contract fetching and
   * caching) then renders the shared `submission-confirmation` template.
   * Falls back to a minimal inline table if either dependency is unavailable
   * or an error is thrown — ensuring the email is always sent.
   */
  private async resolveHtmlBody(
    payload: SubmissionCreatedEvent,
  ): Promise<string> {
    try {
      const ctx = await this.emailBodyBuilder.build(payload);
      const rendered = this.templateService.render(
        CONFIRMATION_TEMPLATE,
        ctx as unknown as Record<string, unknown>,
      );
      if (rendered !== null) return rendered;
      this.logger.warn(
        `[email] Template render returned null for "${CONFIRMATION_TEMPLATE}"`,
      );
    } catch (err) {
      this.logger.warn(
        `[email] Could not render confirmation template for form "${payload.formId}" — falling back to generic body`,
        err,
      );
    }

    return this.buildHtmlBody(payload);
  }

  private buildTextBody(payload: SubmissionCreatedEvent): string {
    return [
      "Your submission has been received.",
      "",
      `Reference: ${payload.submissionId}`,
      `Form:      ${payload.formId}`,
      `Submitted: ${payload.meta.submittedAt}`,
    ].join("\n");
  }

  private buildHtmlBody(payload: SubmissionCreatedEvent): string {
    return `
      <p>Your submission has been received.</p>
      <table>
        <tr><th>Reference</th><td>${payload.submissionId}</td></tr>
        <tr><th>Form</th><td>${payload.formId}</td></tr>
        <tr><th>Submitted</th><td>${payload.meta.submittedAt}</td></tr>
      </table>
    `.trim();
  }
}
