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

    for (const entry of entries) {
      const cfg = (entry.config ?? {}) as Record<string, unknown>;
      await this.processEntry(payload, cfg);
    }

    return { kind: "completed" };
  }

  private async processEntry(
    payload: SubmissionCreatedEvent,
    cfg: Record<string, unknown>,
  ): Promise<void> {
    const recipientField = cfg["recipientField"] as string | undefined;
    if (!recipientField) {
      this.logger.warn(
        `[email] No recipientField configured for submission ${payload.submissionId} — skipping`,
      );
      return;
    }

    // recipientField format: "stepId.fieldId". Targeting fields inside a
    // repeatable step is not supported here — falls through to the
    // warning below.
    const [stepId, fieldId] = recipientField.split(".");
    const stepValues = payload.values[stepId];
    const to =
      stepValues && !Array.isArray(stepValues)
        ? (stepValues[fieldId] as string | undefined)
        : undefined;

    if (!to) {
      this.logger.warn(
        `[email] Could not resolve recipient at "${recipientField}" for submission ${payload.submissionId} — skipping`,
      );
      return;
    }

    const subject =
      (cfg["subject"] as string | undefined) ??
      "Your form submission has been received";

    const htmlBody = await this.resolveHtmlBody(payload);

    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [to] },
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
      `[email] Confirmation sent to ${to} for submission ${payload.submissionId}`,
    );
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
