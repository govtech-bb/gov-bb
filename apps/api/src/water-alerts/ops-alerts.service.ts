import { Injectable, Logger } from "@nestjs/common";
import Handlebars from "handlebars";
import { SesMailer } from "../email/ses-mailer";
import { WaterOpsAlertRepository } from "./water-ops-alert.repository";

/** A lasting failure the checker can report. */
export type OpsSignal = "checker-crash" | "send-failures";

const SUBJECT_PREFIX = "Wuh Water Doing";
// While a failure lasts, remind the team this often (#2970).
const REMIND_AFTER_MS = 6 * 60 * 60 * 1000;
const REMIND_AFTER = "6 hours";

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
 * once when a failure starts, a reminder every 6 hours while it lasts, and
 * once when it recovers. Whether to email is decided by WaterOpsAlertRepository
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
      if (!this.claimInMemory(signal)) return;
      await this.send(
        to,
        wording.first,
        `${summary}\n\nThe ops-alert state could not be read, so this task will remind you at most every 6 hours and can't tell you when it recovers.\n\nDetails:\n${details}`,
      );
      return;
    }
    if (!alert) return;

    const since = alert.failingSince.toISOString();
    const subject = alert.kind === "first" ? wording.first : wording.reminder;
    const status =
      alert.kind === "first"
        ? `Failing since ${since}. You'll get a reminder every 6 hours while this continues, and one email when it recovers.`
        : `Still failing since ${since}.`;
    await this.send(
      to,
      subject,
      `${summary}\n\n${status}\n\nDetails:\n${details}`,
    );
  }

  /** Report that `signal` succeeded this run; emails only if it was failing. */
  async recovered(signal: OpsSignal): Promise<void> {
    const to = this.recipient;
    if (!to) return;
    this.fallbackLastAlerted.delete(signal);

    let since: Date | null;
    try {
      since = await this.state.recordRecovery(signal);
    } catch (err) {
      this.logger.warn(
        `Ops alert state unavailable: ${(err as Error).message}`,
      );
      return;
    }
    if (!since) return;
    await this.send(
      to,
      WORDING[signal].recovered,
      `Recovered at ${new Date().toISOString()}, after failing since ${since.toISOString()}.`,
    );
  }

  /** True when this task hasn't alerted `key` within the reminder interval. */
  private claimInMemory(key: string): boolean {
    const now = Date.now();
    const last = this.fallbackLastAlerted.get(key);
    if (last !== undefined && now - last < REMIND_AFTER_MS) return false;
    this.fallbackLastAlerted.set(key, now);
    return true;
  }

  /** Never throws: a failed ops email is logged, not escalated. */
  private async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.mailer.sendSimple({
        to,
        subject: `${SUBJECT_PREFIX}: ${subject}`,
        html: `<pre>${Handlebars.escapeExpression(text)}</pre>`,
        text,
      });
    } catch (err) {
      this.logger.warn(`Ops alert not sent: ${(err as Error).message}`);
    }
  }
}
