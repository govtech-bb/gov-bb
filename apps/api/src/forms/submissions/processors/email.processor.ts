import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

@Injectable()
export class EmailProcessor implements ISubmissionProcessor {
  readonly type = "email" as const;
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.get<string>("email.from") ?? "noreply@gov.bb";
    this.transporter = nodemailer.createTransport({
      host: config.get<string>("email.host"),
      port: config.get<number>("email.port"),
      secure: config.get<boolean>("email.secure"),
      auth: {
        user: config.get<string>("email.user"),
        pass: config.get<string>("email.pass"),
      },
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

    // The Message-ID is set to a deterministic value derived from the
    // submissionId. This acts as a best-effort idempotency signal: mail
    // infrastructure and receiving clients that honour Message-ID will
    // treat repeat sends of the same ID as duplicates.
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      headers: {
        "Message-ID": `<${payload.submissionId}@modular-forms.gov.bb>`,
      },
      text: this.buildTextBody(payload),
      html: this.buildHtmlBody(payload),
    });

    this.logger.log(
      `[email] Confirmation sent to ${to} for submission ${payload.submissionId}`,
    );

    return { kind: "completed" };
  }

  private buildTextBody(payload: SubmissionCreatedEvent): string {
    return [
      `Your submission has been received.`,
      ``,
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
