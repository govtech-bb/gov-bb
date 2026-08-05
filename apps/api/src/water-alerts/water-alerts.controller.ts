import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FeedService } from "./feed.service";
import type { Outage } from "./outages.domain";

export interface OutagesResponse {
  outages: Outage[];
  /** ISO instant the feed was read. */
  checkedAt: string;
}

@Controller("water-alerts")
export class WaterAlertsController {
  private readonly logger = new Logger(WaterAlertsController.name);

  constructor(private readonly feed: FeedService) {}

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
}
