import { randomUUID } from "node:crypto";
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { isUUID } from "class-validator";
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
// calls the API back). Built onto LANDING_BASE_URL.
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
    return (process.env.LANDING_BASE_URL || "http://localhost:3000").replace(
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
      // The racing request may not have sent its confirmation successfully yet.
      if (String(err).includes("uq_water_subscribers_email_area")) {
        throw new ServiceUnavailableException(
          "A sign-up is already being processed. Please try again shortly.",
        );
      }
      throw err;
    }

    const emailSent = await this.sendConfirm(normEmail, normArea, confirmToken);
    if (!emailSent) {
      throw new ServiceUnavailableException(
        "We couldn't send your confirmation email. Please try signing up again.",
      );
    }
    return { ok: true, message: CONFIRM_MESSAGE, emailSent };
  }

  async confirm(token: string): Promise<TokenOutcome> {
    if (!isUUID(token, "4")) return "invalid";
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
    if (!isUUID(token, "4")) return "invalid";
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

  /** Returns false on delivery failure so sign-up can report a retryable error. */
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
