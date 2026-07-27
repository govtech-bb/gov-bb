import { Controller, Get, Query } from "@nestjs/common";
import { GeocodeResult, GeocodeService } from "./geocode.service";

@Controller("geocode")
export class GeocodeController {
  constructor(private readonly geocode: GeocodeService) {}

  /** `GET /geocode?q=` — Barbados-only address suggestions. */
  @Get()
  search(@Query("q") q?: string): Promise<GeocodeResult[]> {
    return this.geocode.search(q ?? "");
  }
}
