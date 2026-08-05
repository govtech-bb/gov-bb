import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Not } from "typeorm";
import {
  WaterSubscriberEntity,
  WaterSubscriberStatus,
} from "@govtech-bb/database";
import { SesMailer } from "../email/ses-mailer";
import { buildConfirmEmail } from "./emails";
import { areaLabelFor } from "./parishes";
import { WaterSubscriberRepository } from "./water-subscriber.repository";

// Public route the confirm/unsubscribe links resolve to (a landing page that
// calls the API back). Built onto PUBLIC_SITE_URL.
const WATER_OUTAGES_PATH = "/health-and-emergency-services/water-outages";

export type TokenOutcome = "done" | "already" | "invalid";

export interface SubscribeResult {
  ok: true;
  message: string;
  /** For tests/telemetry — did we send a confirmation email this call? */
  emailSent: boolean;
}

const CONFIRM_MESSAGE =
  "Almost done. Check your email and click the link to confirm.";
const ALREADY_MESSAGE = "You're already getting alerts for this area.";

/**
 * Subscribe / confirm / unsubscribe for water-outage alerts. Double opt-in: a
 * sign-up is saved as `pending` and only becomes `confirmed` when the emailed
 * link is opened. Ported from the prototype's subscribe/confirm/unsubscribe
 * route handlers; email now goes through SES instead of SMTP.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscribers: WaterSubscriberRepository,
    private readonly mailer: SesMailer,
  ) {}

  private get siteUrl(): string {
    return (process.env.PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    );
  }

  async subscribe(email: string, area?: string): Promise<SubscribeResult> {
    const normEmail = email.toLowerCase();
    const normArea = !area || area === "" ? "all" : area;

    let confirmToken: string;
    try {
      const existing = await this.subscribers.findOne({
        where: { email: normEmail, area: normArea },
      });

      if (existing?.status === WaterSubscriberStatus.CONFIRMED) {
        // Already fully signed up — no duplicate, no email.
        return { ok: true, message: ALREADY_MESSAGE, emailSent: false };
      }

      if (existing?.status === WaterSubscriberStatus.UNSUBSCRIBED) {
        // They left before; let them back in with a fresh confirm code.
        confirmToken = randomUUID();
        await this.subscribers.update(existing.id, {
          status: WaterSubscriberStatus.PENDING,
          confirmToken,
          confirmedAt: null,
        });
      } else if (existing) {
        // status === pending: reuse the existing code and re-send the email.
        confirmToken = existing.confirmToken;
      } else {
        // Brand new sign-up.
        confirmToken = randomUUID();
        await this.subscribers.save(
          this.subscribers.create({
            email: normEmail,
            area: normArea,
            confirmToken,
            unsubscribeToken: randomUUID(),
          } as Partial<WaterSubscriberEntity>),
        );
      }
    } catch (err) {
      // Backstop: two identical sign-ups raced and the unique rule rejected the
      // second. Treat as "already signed up", not an error.
      if (String(err).includes("uq_water_subscribers_email_area")) {
        return { ok: true, message: CONFIRM_MESSAGE, emailSent: false };
      }
      throw err;
    }

    const emailSent = await this.sendConfirm(normEmail, normArea, confirmToken);
    return { ok: true, message: CONFIRM_MESSAGE, emailSent };
  }

  async confirm(token: string): Promise<TokenOutcome> {
    const res = await this.subscribers.update(
      { confirmToken: token, status: WaterSubscriberStatus.PENDING },
      { status: WaterSubscriberStatus.CONFIRMED, confirmedAt: new Date() },
    );
    if (res.affected) return "done";

    const existing = await this.subscribers.findOne({
      where: { confirmToken: token },
    });
    return existing?.status === WaterSubscriberStatus.CONFIRMED
      ? "already"
      : "invalid";
  }

  async unsubscribe(token: string): Promise<TokenOutcome> {
    const res = await this.subscribers.update(
      {
        unsubscribeToken: token,
        status: Not(WaterSubscriberStatus.UNSUBSCRIBED),
      },
      { status: WaterSubscriberStatus.UNSUBSCRIBED },
    );
    if (res.affected) return "done";

    const existing = await this.subscribers.findOne({
      where: { unsubscribeToken: token },
    });
    return existing?.status === WaterSubscriberStatus.UNSUBSCRIBED
      ? "already"
      : "invalid";
  }

  /** Sends the confirm email. Never throws — a mail hiccup can't break sign-up. */
  private async sendConfirm(
    to: string,
    area: string,
    confirmToken: string,
  ): Promise<boolean> {
    const confirmUrl = `${this.siteUrl}${WATER_OUTAGES_PATH}/confirm?token=${confirmToken}`;
    const { subject, html, text } = buildConfirmEmail(
      areaLabelFor(area),
      confirmUrl,
    );
    try {
      await this.mailer.sendSimple({ to, subject, html, text });
      return true;
    } catch (err) {
      this.logger.warn(
        `Confirm email not sent to ${to}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
