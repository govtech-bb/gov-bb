import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DataSource } from "typeorm";
import { SesMailer } from "../email/ses-mailer";
import {
  type AlertNotice,
  buildAlertEmail,
  buildDemoAlertEmail,
  type EmailContent,
} from "./emails";
import { FeedService } from "./feed.service";
import { isPast, type Outage } from "./outages.domain";
import { areaLabelFor } from "./parishes";
import {
  type PendingAlert,
  WaterSentAlertRepository,
} from "./water-sent-alert.repository";
import { WaterSubscriberRepository } from "./water-subscriber.repository";

// Public path the unsubscribe body-link resolves to (a landing page).
const WATER_OUTAGES_PATH = "/health-and-emergency-services/water-outages";
// Session-scoped advisory-lock key so only one API task runs the check at once.
const CHECK_LOCK_KEY = 91442;
// How many emails to send concurrently, and mark sent per batch. Bounds SES
// concurrency and keeps the number of UPDATEs to ceil(recipients / batch).
const SEND_BATCH = 25;

export interface CheckSummary {
  activeNotices: number;
  /** Matched (notice, subscriber) pairs — dry-run only. */
  recipients?: number;
  attempted: number;
  sent: number;
  failed: number;
  dryRun?: boolean;
  plan?: Array<{ notice: string; recipients: string[] }>;
}

/**
 * The alert checker. Every 30 minutes it reads the BWA feed, matches confirmed
 * subscribers to each active notice, and emails them exactly once
 * (claim-then-send via the water_sent_alerts unique constraint). Ported from the
 * prototype's src/lib/checker.ts; the GitHub-Actions-hits-an-open-endpoint
 * trigger becomes an in-process @Cron, guarded by a Postgres advisory lock so
 * multiple API tasks don't run it concurrently.
 */
@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly feed: FeedService,
    private readonly subscribers: WaterSubscriberRepository,
    private readonly sentAlerts: WaterSentAlertRepository,
    private readonly mailer: SesMailer,
  ) {}

  private get siteUrl(): string {
    return (process.env.PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    );
  }

  private get apiUrl(): string {
    return (process.env.API_PUBLIC_URL ?? "http://localhost:3001").replace(
      /\/+$/,
      "",
    );
  }

  /** The scheduled run: single-flight across API tasks via an advisory lock. */
  @Cron("*/30 * * * *")
  async scheduled(): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const [{ pg_try_advisory_lock: locked }] = await runner.query(
        `SELECT pg_try_advisory_lock($1)`,
        [CHECK_LOCK_KEY],
      );
      if (!locked) return; // another task is already running the check.
      try {
        const summary = await this.runAlertCheck({});
        this.logger.log(`alert check: ${JSON.stringify(summary)}`);
        if (summary.failed > 0) {
          await this.sendOpsAlert(
            `Wuh Water Doing: ${summary.failed} alert send(s) failed`,
            JSON.stringify(summary, null, 2),
          );
        }
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [CHECK_LOCK_KEY]);
      }
    } catch (err) {
      this.logger.error("alert checker crashed", err as Error);
      await this.sendOpsAlert(
        "Wuh Water Doing: alert checker crashed",
        String(err),
      );
    } finally {
      await runner.release();
    }
  }

  /** On-demand demo: one synthetic all-parish notice, sent with the demo template. */
  async runDemo(): Promise<CheckSummary> {
    const notice: Outage = {
      id: `demo-${new Date().toISOString()}`,
      title: "Demonstration water notice",
      link: "https://barbadoswaterauthority.com/",
      published: new Date().toISOString(),
      summary:
        "This is a test of the water-alerts feature. No real outage is in progress.",
      parishes: [],
      type: "emergency",
    };
    return this.runAlertCheck({ notices: [notice], demo: true });
  }

  /**
   * Core check. Everything is set-based — the number of DB round-trips does NOT
   * grow with the subscriber count, so it stays fast and reliable when a notice
   * fans out to thousands of citizens.
   *
   * Phase 1: claim every matching (notice, subscriber) pair in ONE statement.
   * Phase 2: fetch still-unsent claims (one query), send in bounded concurrent
   * batches, and mark each batch sent in one statement. Failed or SES-throttled
   * sends stay unsent and are retried on the next run.
   */
  async runAlertCheck(
    opts: { notices?: Outage[]; dryRun?: boolean; demo?: boolean } = {},
  ): Promise<CheckSummary> {
    const now = Date.now();
    const notices = opts.notices ?? (await this.feed.fetchOutages());
    const active = notices.filter((o) => !isPast(o, now));
    const noticeById = new Map(active.map((n) => [n.id, n]));

    // Flatten active notices into parallel (notice_id, area) arrays so matching
    // is one set-based query, not a query per notice or per subscriber.
    const pairNoticeIds: string[] = [];
    const pairAreas: string[] = [];
    for (const notice of active) {
      for (const area of areasFor(notice)) {
        pairNoticeIds.push(notice.id);
        pairAreas.push(area);
      }
    }

    if (opts.dryRun) {
      const matched = await this.subscribers.matchedRecipients(
        pairNoticeIds,
        pairAreas,
      );
      const byNotice = new Map<string, string[]>();
      for (const m of matched) {
        const list = byNotice.get(m.noticeId);
        if (list) list.push(m.email);
        else byNotice.set(m.noticeId, [m.email]);
      }
      return {
        activeNotices: active.length,
        recipients: matched.length,
        attempted: 0,
        sent: 0,
        failed: 0,
        dryRun: true,
        plan: active.map((n) => ({
          notice: n.title,
          recipients: byNotice.get(n.id) ?? [],
        })),
      };
    }

    // Phase 1 — claim all pairs in a single statement.
    await this.sentAlerts.claimForPairs(pairNoticeIds, pairAreas);

    // Phase 2 — send the unsent claims, batch-marking each group sent.
    const pending = await this.sentAlerts.pendingUnsent([...noticeById.keys()]);
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i += SEND_BATCH) {
      const batch = pending.slice(i, i + SEND_BATCH);
      const results = await Promise.allSettled(
        batch.map((row) => this.sendOne(row, noticeById, opts.demo ?? false)),
      );
      const okNoticeIds: string[] = [];
      const okSubscriberIds: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value) {
          sent++;
          okNoticeIds.push(batch[idx].noticeId);
          okSubscriberIds.push(batch[idx].subscriberId);
        } else {
          failed++;
        }
      });
      await this.sentAlerts.markManySent(okNoticeIds, okSubscriberIds);
    }

    return {
      activeNotices: active.length,
      attempted: pending.length,
      sent,
      failed,
    };
  }

  /** Builds and sends one alert. Returns whether it was sent (never throws). */
  private async sendOne(
    row: PendingAlert,
    noticeById: Map<string, Outage>,
    demo: boolean,
  ): Promise<boolean> {
    const outage = noticeById.get(row.noticeId);
    if (!outage) return false;

    const areaLabel = areaLabelFor(row.area);
    const notice: AlertNotice = {
      title: outage.title,
      summary: outage.summary,
      link: outage.link,
    };
    const bodyUnsubUrl = `${this.siteUrl}${WATER_OUTAGES_PATH}/unsubscribe?token=${row.unsubscribeToken}`;
    const oneClickUnsubUrl = `${this.apiUrl}/water-alerts/unsubscribe/${row.unsubscribeToken}`;

    const content = demo
      ? buildDemoAlertEmail(areaLabel, notice, bodyUnsubUrl)
      : buildAlertEmail(areaLabel, notice, bodyUnsubUrl);

    return this.sendAlert(row.email, content, oneClickUnsubUrl);
  }

  /** Sends an alert with RFC 8058 one-click unsubscribe headers. Never throws. */
  private async sendAlert(
    to: string,
    content: EmailContent,
    oneClickUnsubUrl: string,
  ): Promise<boolean> {
    try {
      await this.mailer.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.mailer.from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: content.subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: content.html, Charset: "UTF-8" },
                Text: { Data: content.text, Charset: "UTF-8" },
              },
              Headers: [
                { Name: "List-Unsubscribe", Value: `<${oneClickUnsubUrl}>` },
                {
                  Name: "List-Unsubscribe-Post",
                  Value: "List-Unsubscribe=One-Click",
                },
              ],
            },
          },
          ...(this.mailer.configurationSet && {
            ConfigurationSetName: this.mailer.configurationSet,
          }),
        }),
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Alert email to ${to} failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /** Ops alert to the team. No-op if WATER_OPS_RECIPIENT is unset. */
  private async sendOpsAlert(subject: string, text: string): Promise<void> {
    const to = process.env.WATER_OPS_RECIPIENT;
    if (!to) return;
    try {
      await this.mailer.sendSimple({
        to,
        subject,
        html: `<pre>${text}</pre>`,
        text,
      });
    } catch (err) {
      this.logger.warn(`Ops alert not sent: ${(err as Error).message}`);
    }
  }
}

/** A parish notice goes to that parish AND "all"; an untagged notice → "all". */
function areasFor(notice: Outage): string[] {
  return notice.parishes.length ? [...notice.parishes, "all"] : ["all"];
}
