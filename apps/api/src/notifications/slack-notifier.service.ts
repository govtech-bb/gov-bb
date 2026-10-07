import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";

/** Injection token for the resolved Slack incoming-webhook URL (empty ⇒ off). */
export const SLACK_WEBHOOK_URL = "SLACK_WEBHOOK_URL";

/** Slack request timeout — the caller awaits this, so a slow/unreachable Slack
 *  endpoint must not stall submission processing. */
const SLACK_TIMEOUT_MS = 3000;

/**
 * Posts best-effort operator alerts to a Slack incoming webhook (#2168). Mirrors
 * apps/feature_flagging/app/server/slack-notif.ts: fail-soft (never throws),
 * bounded, and a no-op when no webhook is configured (dev/sandbox/unset). The
 * webhook URL comes from a secret via env (SLACK_ALERTS_WEBHOOK_URL); the caller
 * is responsible for keeping PII out of `message` (see mrkdwnEscape).
 */
@Injectable()
export class SlackNotifierService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlackNotifierService.name);

  constructor(private readonly webhookUrl: string) {}

  /** Surface the alerting mechanism's own on/off state once at boot. An unset
   *  webhook is a silent no-op, so without this there is no way to tell from the
   *  logs whether operator alerting is actually live in a given environment. */
  onApplicationBootstrap(): void {
    if (this.webhookUrl) return;
    const message = "Slack alerts disabled — SLACK_ALERTS_WEBHOOK_URL unset";
    if (process.env.NODE_ENV === "production") this.logger.warn(message);
    else this.logger.debug(message);
  }

  async notify(message: string): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
      });
      // A rotated (404), revoked (403), payload-rejected, or rate-limited (429)
      // webhook resolves without throwing. For the alerting channel itself that
      // silent failure is the one we cannot carry — it would leave the mechanism
      // dead while everything looks healthy — so surface a non-2xx status.
      if (!res.ok) {
        this.logger.warn(`[slack] alert rejected: HTTP ${res.status}`);
      }
    } catch (err) {
      // Best-effort: a timeout or delivery failure must never surface into the
      // caller (which is deciding whether to delete or redrive an SQS message).
      this.logger.warn(
        `[slack] alert delivery failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/**
 * Escape Slack mrkdwn control characters (`&`, `<`, `>`) so interpolated text
 * renders verbatim and cannot break out of a `<url|text>` link.
 * https://docs.slack.dev/messaging/formatting-message-text#escaping
 */
export function mrkdwnEscape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
