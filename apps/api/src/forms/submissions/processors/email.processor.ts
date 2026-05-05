import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

@Injectable()
export class EmailProcessor implements ISubmissionProcessor {
  readonly type = "email" as const;
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly client: SESv2Client;
  private readonly from: string;
  private readonly configurationSet: string | undefined;

  constructor(config: ConfigService) {
    this.from = config.get<string>("email.from") ?? "noreply@gov.bb";
    this.configurationSet = config.get<string>("email.configurationSet");
    this.client = new SESv2Client({
      region: config.get<string>("email.region") ?? "us-east-1",
    });
  }

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    const cfg =
      payload.processors.find((p) => p.type === "email")?.config ?? {};

    const recipientField = cfg["recipientField"] as string | undefined;
    if (!recipientField) {
      this.logger.warn(
        `[email] No recipientField configured for submission ${payload.submissionId} — skipping`,
      );
      return { kind: "completed" };
    }

    // recipientField format: "stepId.fieldId"
    const [stepId, fieldId] = recipientField.split(".");
    const to = payload.values[stepId]?.[fieldId] as string | undefined;

    if (!to) {
      this.logger.warn(
        `[email] Could not resolve recipient at "${recipientField}" for submission ${payload.submissionId} — skipping`,
      );
      return { kind: "completed" };
    }

    const subject =
      (cfg["subject"] as string | undefined) ??
      "Your form submission has been received";

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
                Data: this.buildHtmlBody(payload),
                Charset: "UTF-8",
              },
            },
          },
        },
        // EmailTags are forwarded to the SES event destination (SNS/EventBridge).
        // Tagging with submissionId lets the configuration set's bounce/complaint
        // stream filter or deduplicate events per submission without extra plumbing.
        EmailTags: [{ Name: "submissionId", Value: payload.submissionId }],
        // ConfigurationSetName wires this send into the SES event destination
        // so bounces and complaints are tracked automatically.
        ...(this.configurationSet && {
          ConfigurationSetName: this.configurationSet,
        }),
      }),
    );

    this.logger.log(
      `[email] Confirmation sent to ${to} for submission ${payload.submissionId}`,
    );

    return { kind: "completed" };
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
