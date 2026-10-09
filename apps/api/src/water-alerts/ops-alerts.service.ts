import { Injectable, Logger } from "@nestjs/common";
import Handlebars from "handlebars";
import { SesMailer } from "../email/ses-mailer";
import type { SkippedNotice } from "./feed.service";
import { WaterOpsAlertRepository } from "./water-ops-alert.repository";

/** A lasting failure the checker can report. */
export type OpsSignal = "checker-crash" | "send-failures";

const SUBJECT_PREFIX = "Wuh Water Doing";
// While a failure lasts, remind the team this often (#2970). Also the most
// often a flapping failure is emailed.
const REMIND_AFTER_HOURS = 6;
const REMIND_AFTER_MS = REMIND_AFTER_HOURS * 60 * 60 * 1000;
const REMIND_AFTER = `${REMIND_AFTER_HOURS} hours`;

const WORDING: Record<
  OpsSignal,
  { first: string; reminder: string; recovered: string }
> = {
  "checker-crash": {
    first: "alert checker crashed",
    reminder: "alert checker still failing",
    recovered: "alert checker recovered",
  },
  "send-failures": {
    first: "alert sends failing",
    reminder: "alert sends still failing",
    recovered: "alert sends recovered",
  },
};

/**
 * Emails the ops team about the alert checker without flooding them (#2970):
 * when a failure starts, a reminder every 6 hours while it lasts, and once
 * when it recovers. A key is never emailed more than once per 6 hours, so a
 * failure that flaps (fail, recover, fail…) can't flood either: a failure
 * inside that window is recorded but not emailed, and then recovers silently. Whether to email is decided by WaterOpsAlertRepository
 * in one atomic statement, so several API tasks reporting the same failure
 * send one email. Claim, then send: if the ops email itself fails, that alert
 * waits for the next reminder rather than risking two tasks both sending.
 *
 * If the state table can't be reached (e.g. the database is what's down), each
 * task falls back to remembering its own last alert in memory: at worst one
 * email per task per 6 hours, and no "recovered" email for that outage.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);
  private readonly fallbackLastAlerted = new Map<string, number>();

  constructor(
    private readonly state: WaterOpsAlertRepository,
    private readonly mailer: SesMailer,
  ) {}

  /** No-op if WATER_OPS_RECIPIENT is unset. */
  private get recipient(): string | undefined {
    return process.env.WATER_OPS_RECIPIENT || undefined;
  }

  /**
   * Report that `signal` failed this run. `summary` is a one-line reason that
   * leads the email; `details` is the raw error or run summary below it.
   */
  async failure(
    signal: OpsSignal,
    summary: string,
    details: string,
  ): Promise<void> {
    const to = this.recipient;
    if (!to) return;
    const wording = WORDING[signal];

    let alert;
    try {
      alert = await this.state.recordFailure(signal, REMIND_AFTER);
    } catch (err) {
      this.logger.warn(
        `Ops alert state unavailable, throttling in memory: ${(err as Error).message}`,
      );
      const claim = this.claimInMemory(signal);
      if (!claim) return;
      await this.send(
        to,
        claim === "first" ? wording.first : wording.reminder,
        `${summary}\n\nThe ops-alert state could not be read, so this task will remind you at most every ${REMIND_AFTER} and can't tell you when it recovers.\n\nDetails:\n${details}`,
      );
      return;
    }
    if (!alert) return;

    const since = alert.failingSince.toISOString();
    const subject = alert.kind === "first" ? wording.first : wording.reminder;
    const status =
      alert.kind === "first"
        ? `Failing since ${since}. You'll get a reminder every ${REMIND_AFTER} while this continues, and one email when it recovers.`
        : `Still failing since ${since}.`;
    const delivered = await this.send(
      to,
      subject,
      `${summary}\n\n${status}\n\nDetails:\n${details}`,
    );
    // Not delivered: forget the alert so the next run tries again, and so a
    // recovery before then stays silent (ops were never told it failed).
    if (!delivered) {
      await this.state
        .forgetAlert(signal)
        .catch((err: Error) =>
          this.logger.warn(`Could not reset ops alert: ${err.message}`),
        );
    }
  }

  /**
   * Mark `signal` healthy without emailing: the failure no longer applies, but
   * nothing proved it fixed (e.g. the failed sends' notice has ended).
   */
  async cleared(signal: OpsSignal): Promise<void> {
    if (!this.recipient) return;
    try {
      await this.state.markHealthy(signal);
    } catch (err) {
      this.logger.warn(
        `Ops alert state unavailable: ${(err as Error).message}`,
      );
    }
  }

  /** Report that `signal` succeeded this run; emails only if it was failing. */
  async recovered(signal: OpsSignal): Promise<void> {
    const to = this.recipient;
    if (!to) return;

    let since: Date | null;
    try {
      since = await this.state.recordRecovery(signal);
    } catch (err) {
      // Keep any in-memory throttle: if the table is what's unreachable, a
      // flapping failure must not email on every failed run.
      this.logger.warn(
        `Ops alert state unavailable: ${(err as Error).message}`,
      );
      return;
    }
    this.fallbackLastAlerted.delete(signal);
    if (!since) return;
    await this.send(
      to,
      WORDING[signal].recovered,
      `Recovered at ${new Date().toISOString()}, after failing since ${since.toISOString()}.`,
    );
  }

  /**
   * Report notices the feed skipped as invalid. Each is emailed once (keyed by
   * a hash of its guid or link, see SkippedNotice.key), all new ones in a
   * single email. If the state table
   * can't be reached this does nothing: skips are low-urgency and the feed
   * service already logs them on every fetch.
   */
  async newSkippedNotices(skipped: SkippedNotice[]): Promise<void> {
    const to = this.recipient;
    if (!to || skipped.length === 0) return;
    const byKey = new Map(skipped.map((n) => [`skipped-notice:${n.key}`, n]));

    let fresh: string[];
    try {
      fresh = await this.state.claimNew([...byKey.keys()]);
    } catch (err) {
      this.logger.warn(
        `Ops alert state unavailable: ${(err as Error).message}`,
      );
      return;
    }
    if (fresh.length === 0) return;

    const lines = fresh.map((key) => {
      const notice = byKey.get(key)!;
      return `- ${notice.ref}: ${notice.reason}`;
    });
    const delivered = await this.send(
      to,
      `${fresh.length} BWA notice(s) skipped`,
      `These notices failed validation, so they are not shown on the site or sent to subscribers. Each notice is reported once.\n\n${lines.join("\n")}`,
    );
    // These have no reminder, so a lost email would hide them for good:
    // un-claim them and let the next run try again.
    if (!delivered) {
      await this.state
        .releaseClaims(fresh)
        .catch((err: Error) =>
          this.logger.warn(
            `Could not release ops alert claims: ${err.message}`,
          ),
        );
    }
  }

  /**
   * In-memory stand-in for recordFailure: "first" or "reminder" when this task
   * hasn't alerted `key` within the reminder interval, otherwise null.
   */
  private claimInMemory(key: string): "first" | "reminder" | null {
    const now = Date.now();
    const last = this.fallbackLastAlerted.get(key);
    if (last !== undefined && now - last < REMIND_AFTER_MS) return null;
    this.fallbackLastAlerted.set(key, now);
    return last === undefined ? "first" : "reminder";
  }

  /** Never throws: a failed ops email is logged and reported as false. */
  private async send(
    to: string,
    subject: string,
    text: string,
  ): Promise<boolean> {
    try {
      await this.mailer.sendSimple({
        to,
        subject: `${SUBJECT_PREFIX}: ${subject}`,
        html: `<pre>${Handlebars.escapeExpression(text)}</pre>`,
        text,
      });
      return true;
    } catch (err) {
      this.logger.warn(`Ops alert not sent: ${(err as Error).message}`);
      return false;
    }
  }
}
