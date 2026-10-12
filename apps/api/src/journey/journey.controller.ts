import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JourneyService } from "./journey.service";

// First-party journey analytics for the landing and forms sites, replacing
// Umami: page views, form starts, steps, drop-offs and searches, which only the
// browser sees. Each event becomes one JSON log line (log_type
// "journey_event"); dashboards are built from the logs.
//
// The path is deliberately neutral: ad blockers match words like "analytics",
// "track" and "collect", and every blocked request is a lost count.
@ApiTags("Journey")
@Controller("journey")
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  @Post()
  @HttpCode(204)
  // Looser than the global default (5 per 10s): one form step sends two or
  // three events, and many citizens share an IP behind government and mobile
  // networks. A throttled request is a lost event, so err towards accepting;
  // the WAF rate-based rule still caps floods.
  @Throttle({
    short: { limit: 40, ttl: 10_000 },
    medium: { limit: 300, ttl: 60_000 },
    long: { limit: 5_000, ttl: 3_600_000 },
  })
  @ApiOperation({
    summary: "Record first-party journey events (landing and forms sites)",
  })
  record(
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
  ): void {
    this.journeyService.record(body, userAgent);
  }
}
