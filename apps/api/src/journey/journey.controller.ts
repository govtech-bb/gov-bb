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
  // No app-level throttle. It was skipped while apps/api did not set Express
  // `trust proxy`, when ThrottlerGuard keyed on the balancer hop and every
  // citizen on a task shared one bucket, so a busy hour would refuse real
  // events and undercount (#3022 review). main.ts now trusts the ALB hop, so a
  // per-citizen limit here is possible; adding one is a separate decision. Abuse is bounded by
  // the 64 KB text / 1 MB JSON body limits (main.ts) and 25 events per request
  // (schema).
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
