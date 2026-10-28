/**
 * Outbound email for review notifications (#3267): SES in a deployed
 * environment, the log for local runs and tests, chosen by
 * `REVIEW_NOTIFICATIONS`.
 */

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { Logger } from "pino";
import type { NotificationsConfig } from "../config";
import type { Email, Mailer } from "../services/review-notifications";

/** Writes each email to the log instead of sending it. */
export class LogMailer implements Mailer {
  constructor(private readonly logger: Pick<Logger, "info">) {}

  async send(email: Email): Promise<void> {
    this.logger.info({ email }, "review email");
  }
}

/**
 * Sends plain-text email through SESv2, as apps/api's mailer does. Credentials
 * come from the SDK's default chain: the ECS task role when deployed.
 */
export class SesMailer implements Mailer {
  private readonly client: SESv2Client;

  constructor(
    private readonly from: string,
    region: string,
  ) {
    this.client = new SESv2Client({ region });
  }

  async send(email: Email): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [email.to] },
        Content: {
          Simple: {
            Subject: { Data: email.subject, Charset: "UTF-8" },
            Body: { Text: { Data: email.text, Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}

/** The mailer the configuration chooses, or undefined when review emails are off. */
export function mailerFor(
  config: NotificationsConfig,
  logger: Pick<Logger, "info">,
): Mailer | undefined {
  switch (config.transport) {
    case "off":
      return undefined;
    case "log":
      return new LogMailer(logger);
    case "ses":
      return new SesMailer(config.from, config.region);
    default: {
      const unexpected: never = config;
      throw new Error(`Unknown mail transport ${String(unexpected)}`);
    }
  }
}
