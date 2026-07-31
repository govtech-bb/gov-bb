import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { GeocodeResult, GeocodeService } from "./geocode.service";

// Autocomplete is naturally chattier than a page load — the global short bucket
// (5 req / 10s) trips on a few keystrokes and returns 429. Raise it to a bound
// that fits debounced typing while still capping abuse. (Cached and upstream-
// rate-limited server-side, so this only gates browser → API calls.)
@Throttle({
  short: { limit: 30, ttl: 10_000 },
  medium: { limit: 200, ttl: 60_000 },
})
@Controller("geocode")
export class GeocodeController {
  constructor(private readonly geocode: GeocodeService) {}

  /** `GET /geocode?q=` — Barbados-only address suggestions. */
  @Get()
  search(@Query("q") q?: string): Promise<GeocodeResult[]> {
    return this.geocode.search(q ?? "");
  }
}
