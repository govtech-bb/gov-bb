import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SubscribeDto } from "./dto/subscribe.dto";
import { FeedService } from "./feed.service";
import type { Outage } from "./outages.domain";
import {
  type SubscribeResult,
  SubscriptionService,
  type TokenOutcome,
} from "./subscription.service";

export interface OutagesResponse {
  outages: Outage[];
  /** ISO instant the feed was read. */
  checkedAt: string;
}

@Controller("water-alerts")
export class WaterAlertsController {
  private readonly logger = new Logger(WaterAlertsController.name);

  constructor(
    private readonly feed: FeedService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  /**
   * `GET /water-alerts/outages` — parsed BWA notices for the map/list. Returns
   * 503 when the feed is unreachable rather than fake data, so the site shows
   * an honest "can't reach BWA" state.
   */
  @Throttle({
    short: { limit: 20, ttl: 10_000 },
    medium: { limit: 120, ttl: 60_000 },
  })
  @Get("outages")
  async outages(): Promise<OutagesResponse> {
    try {
      const outages = await this.feed.fetchOutages();
      return { outages, checkedAt: new Date().toISOString() };
    } catch (error) {
      this.logger.warn(
        `Could not reach the BWA feed: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException("BWA feed unavailable");
    }
  }

  /** `POST /water-alerts/subscribe` — sign up for alerts (double opt-in). */
  @Throttle({
    short: { limit: 5, ttl: 10_000 },
    medium: { limit: 20, ttl: 60_000 },
  })
  @Post("subscribe")
  subscribe(@Body() body: SubscribeDto): Promise<SubscribeResult> {
    return this.subscriptions.subscribe(body.email, body.area);
  }

  /** `GET /water-alerts/confirm/:token` — flip pending → confirmed. */
  @Get("confirm/:token")
  async confirm(
    @Param("token") token: string,
  ): Promise<{ result: TokenOutcome }> {
    return { result: await this.subscriptions.confirm(token) };
  }

  /** `GET /water-alerts/unsubscribe/:token` — mark unsubscribed (link click). */
  @Get("unsubscribe/:token")
  async unsubscribe(
    @Param("token") token: string,
  ): Promise<{ result: TokenOutcome }> {
    return { result: await this.subscriptions.unsubscribe(token) };
  }

  /**
   * `POST /water-alerts/unsubscribe/:token` — RFC 8058 one-click unsubscribe.
   * Mailbox providers POST here from the email header; always answers 200.
   */
  @HttpCode(200)
  @Post("unsubscribe/:token")
  async unsubscribeOneClick(@Param("token") token: string): Promise<void> {
    await this.subscriptions.unsubscribe(token);
  }
}
