import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
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
  // No app-level throttle. apps/api does not set Express `trust proxy`, so
  // behind the load balancer ThrottlerGuard keys on the balancer hop, not the
  // citizen: every citizen on a task would share one bucket, and a busy hour
  // would refuse real events and undercount (#3022 review). Abuse is bounded by
  // the 64 KB text body limit (main.ts) and 25 events per request (schema).
  // A per-client-IP limit belongs in the WAF, which sees the real address; no
  // WAF rule covers this path yet (follow-up in alpha-infra).
  //
  // The buckets are named explicitly: a bare @SkipThrottle() only skips a
  // throttler called "default", and app.module registers short/medium/long.
  @SkipThrottle({ short: true, medium: true, long: true })
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
