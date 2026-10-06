import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  BARBADOS_BOUNDS,
  GeocodeProvider,
  GeocodeResult,
  toGeocodeResult,
} from "../geocode-result";

/** The subset of a Google Geocoding API response we consume. */
interface GoogleGeocodeResponse {
  status?: string;
  error_message?: string;
  results?: {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: { long_name?: string; types?: string[] }[];
    types?: string[];
  }[];
}

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const MAX_RESULTS = 5;

/**
 * Google Geocoding API — metered, with a daily cap. Restricted to Barbados by
 * the `country:BB` component filter, and biased to its bounds.
 *
 * Any status other than OK / ZERO_RESULTS — `OVER_DAILY_LIMIT`,
 * `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `UNKNOWN_ERROR` — means Google could not
 * answer, so it rejects and the service falls back to the next provider.
 */
export class GoogleProvider implements GeocodeProvider {
  readonly name = "google";

  constructor(
    private readonly http: HttpService,
    private readonly apiKey: string,
  ) {}

  async search(query: string): Promise<GeocodeResult[]> {
    const { south, west, north, east } = BARBADOS_BOUNDS;
    const response = await firstValueFrom(
      this.http.get<GoogleGeocodeResponse>(GEOCODE_URL, {
        params: {
          address: query,
          components: "country:BB",
          bounds: `${south},${west}|${north},${east}`,
          key: this.apiKey,
        },
      }),
    );

    const { status, error_message, results } = response.data ?? {};
    if (status === "ZERO_RESULTS") return [];
    if (status !== "OK") {
      throw new Error(
        `status ${status ?? "missing"}${error_message ? `: ${error_message}` : ""}`,
      );
    }

    return (results ?? [])
      .filter(
        (item) =>
          typeof item.formatted_address === "string" &&
          typeof item.geometry?.location?.lat === "number" &&
          typeof item.geometry?.location?.lng === "number" &&
          // A country-level match is Google's "somewhere in Barbados" answer to
          // a query it could not place — its centroid would route the case to
          // an arbitrary polyclinic.
          !item.types?.includes("country"),
      )
      .slice(0, MAX_RESULTS)
      .map((item) =>
        toGeocodeResult({
          label: item.formatted_address as string,
          lat: String(item.geometry?.location?.lat),
          lon: String(item.geometry?.location?.lng),
          parishHints: (item.address_components ?? [])
            .filter((c) => c.types?.includes("administrative_area_level_1"))
            .map((c) => c.long_name),
        }),
      );
  }
}
