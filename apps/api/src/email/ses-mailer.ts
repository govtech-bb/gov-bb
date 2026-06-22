import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/** A single SES tag forwarded to the configured event destination. */
interface EmailTag {
  Name: string;
  Value: string;
}

export interface SendSimpleArgs {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
  tags?: EmailTag[];
}

/**
 * Shared SESv2 setup for the API's transactional emails. Owns the single
 * configured `SESv2Client` plus the `from` identity, configuration set, and the
 * coat-of-arms asset URL so every sender (the submission `EmailProcessor` and
 * the pre-payment `PaymentRequiredListener`) shares one SES configuration —
 * including the local-dev credential handling below.
 *
 * `client` / `from` / `configurationSet` / `coatOfArmsUrl` are exposed for
 * callers (e.g. EmailProcessor) that build their own `SendEmailCommand` —
 * notably the attachment/`Content.Raw` path. `sendSimple` is the convenience
 * path for attachment-free messages.
 */
@Injectable()
export class SesMailer {
  readonly client: SESv2Client;
  readonly from: string;
  readonly configurationSet: string | undefined;
  readonly coatOfArmsUrl: string | undefined;

  constructor(config: ConfigService) {
    this.from = config.get<string>("email.from") ?? "noreply@gov.bb";
    this.configurationSet = config.get<string>("email.configurationSet");
    const assetBaseUrl = config.get<string>("email.assetBaseUrl");
    this.coatOfArmsUrl = assetBaseUrl
      ? `${assetBaseUrl.replace(/\/+$/, "")}/images/coat-of-arms.png`
      : undefined;
    // endpoint is set only in local dev (SES_ENDPOINT → aws-ses-v2-local); in
    // every deployed environment it is undefined, so the SDK resolves the real
    // AWS SES endpoint exactly as before.
    const endpoint = config.get<string>("email.endpoint");
    this.client = new SESv2Client({
      region: config.get<string>("email.region") ?? "us-east-1",
      // When pointing at the local mock, pin static dummy credentials. The
      // mock ignores them, but the SDK signer needs *some* — and pinning them
      // here keeps the local path deterministic regardless of any ambient
      // AWS_PROFILE/SSO a developer has set for real-AWS work. Deployed envs
      // leave endpoint unset → default credential chain (IAM task role).
      ...(endpoint && {
        endpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }),
    });
  }

  /** Sends an attachment-free HTML email via SES `Content.Simple`. */
  async sendSimple(args: SendSimpleArgs): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [args.to] },
        Content: {
          Simple: {
            Subject: { Data: args.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: args.html, Charset: "UTF-8" },
              ...(args.text && {
                Text: { Data: args.text, Charset: "UTF-8" },
              }),
            },
          },
        },
        ...(args.tags && { EmailTags: args.tags }),
        ...(this.configurationSet && {
          ConfigurationSetName: this.configurationSet,
        }),
      }),
    );
  }
}
