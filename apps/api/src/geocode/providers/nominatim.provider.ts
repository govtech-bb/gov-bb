import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  BARBADOS_BOUNDS,
  GeocodeProvider,
  GeocodeResult,
  toGeocodeResult,
} from "../geocode-result";

/** The subset of a Nominatim `/search` (or `/reverse`) result we consume. */
interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
  /** Set by `/reverse` when there is no address at the point. */
  error?: string;
}

const DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org";
// Nominatim's usage policy requires a descriptive, identifying User-Agent.
const USER_AGENT = "gov.bb-forms/1.0 (https://gov.bb)";

/**
 * OpenStreetMap/Nominatim — free, but rate-limited. Restricted to Barbados by
 * country code AND a bounded viewbox. Point it at a self-hosted instance by
 * setting `NOMINATIM_BASE_URL`.
 */
export class NominatimProvider implements GeocodeProvider {
  readonly name = "nominatim";
  readonly cacheable = true;

  constructor(
    private readonly http: HttpService,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  async search(query: string): Promise<GeocodeResult[]> {
    const { west, north, east, south } = BARBADOS_BOUNDS;
    const response = await firstValueFrom(
      this.http.get<NominatimItem[]>(`${this.baseUrl}/search`, {
        params: {
          q: query,
          countrycodes: "bb",
          viewbox: `${west},${north},${east},${south}`,
          bounded: 1,
          format: "json",
          addressdetails: 1,
          limit: 5,
        },
        headers: { "User-Agent": USER_AGENT },
      }),
    );

    return (response.data ?? [])
      .filter(
        (item) =>
          typeof item.display_name === "string" &&
          typeof item.lat === "string" &&
          typeof item.lon === "string",
      )
      .map((item) =>
        toGeocodeResult({
          label: item.display_name as string,
          lat: item.lat as string,
          lon: item.lon as string,
          parishHints: Object.values(item.address ?? {}),
        }),
      );
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResult | null> {
    const response = await firstValueFrom(
      this.http.get<NominatimItem>(`${this.baseUrl}/reverse`, {
        params: { lat, lon, format: "json", addressdetails: 1, zoom: 18 },
        headers: { "User-Agent": USER_AGENT },
      }),
    );

    const item = response.data;
    if (!item || item.error || typeof item.display_name !== "string") {
      return null;
    }
    return toGeocodeResult({
      label: item.display_name,
      // The pin's own point, not the address's: it is the applicant's answer.
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
      parishHints: Object.values(item.address ?? {}),
    });
  }
}
