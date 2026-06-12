import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { MetricsService } from "../telemetry/metrics.service";

/** The feedback fields the service emails — the data subset of the DTO. */
export interface FeedbackInput {
  visitReason?: string;
  whatWentWrong?: string;
  referrer?: string;
}

// Backoff between send attempts. Three attempts total (initial + 2 retries)
// absorbs transient SES errors (throttling, 5xx) without the SQS/DLQ machinery
// the form-submission pipeline uses — proportionate for low-volume site
// feedback. The last delay repeats if ever exceeded.
const RETRY_DELAYS_MS = [200, 500];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly client: SESv2Client;
  private readonly from: string;
  private readonly recipient: string;
  private readonly configurationSet: string | undefined;

  // Overridable in tests so retries don't add real wall-clock delay.
  protected sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  constructor(
    config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.from = config.get<string>("email.from") ?? "noreply@gov.bb";
    this.recipient =
      config.get<string>("email.feedbackRecipient") ?? "feedback@govtech.bb";
    this.configurationSet = config.get<string>("email.configurationSet");
    this.client = new SESv2Client({
      region: config.get<string>("email.region") ?? "us-east-1",
    });
  }

  /**
   * Email a site-feedback submission to the configured feedback inbox.
   *
   * Throws (→ HTTP 500) if every attempt fails, so the landing form reports a
   * real error rather than a false success. A failure is also logged and
   * counted (feedback.email.failures) so silent loss — the original bug
   * (#1298) — cannot recur unnoticed.
   */
  async send(dto: FeedbackInput): Promise<void> {
    const command = new SendEmailCommand({
      FromEmailAddress: this.from,
      Destination: { ToAddresses: [this.recipient] },
      Content: {
        Simple: {
          Subject: { Data: buildSubject(), Charset: "UTF-8" },
          Body: {
            Text: { Data: buildTextBody(dto), Charset: "UTF-8" },
          },
        },
      },
      ...(this.configurationSet && {
        ConfigurationSetName: this.configurationSet,
      }),
    });

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.client.send(command);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(RETRY_DELAYS_MS[attempt - 1]);
        }
      }
    }

    const reason =
      lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(
      `[feedback] failed to send to ${this.recipient} after ${MAX_ATTEMPTS} attempts: ${reason}`,
    );
    this.metrics.recordFeedbackEmailFailure();
    throw new InternalServerErrorException("Failed to send feedback email");
  }
}

function buildSubject(): string {
  return "New feedback from alpha.gov.bb";
}

function buildTextBody(dto: FeedbackInput): string {
  const lines = [
    "Why did you visit alpha.gov.bb?",
    (dto.visitReason ?? "").trim() || "(no answer)",
    "",
    "What went wrong?",
    (dto.whatWentWrong ?? "").trim() || "(no answer)",
  ];
  const referrer = (dto.referrer ?? "").trim();
  if (referrer) {
    lines.push("", `Submitted from: ${referrer}`);
  }
  return lines.join("\n");
}
