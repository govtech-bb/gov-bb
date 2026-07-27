import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

/** A single address suggestion returned to the client. */
export interface GeocodeResult {
  label: string;
  lat: string;
  lon: string;
}

/** The subset of a Nominatim `/search` result we consume. */
interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
}

const DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org";
// Nominatim's usage policy requires a descriptive, identifying User-Agent.
const USER_AGENT = "gov.bb-forms/1.0 (https://gov.bb)";
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/**
 * Proxies address lookups to OpenStreetMap/Nominatim, locked to Barbados
 * (`countrycodes=bb`). Keeps the outbound call server-side so we control the
 * User-Agent, can cache, and can point at a self-hosted instance by setting
 * `NOMINATIM_BASE_URL` — no client or code change. Upstream failures resolve to
 * an empty list so the address field degrades to plain text entry rather than
 * erroring.
 */
@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private readonly cache = new Map<
    string,
    { expires: number; results: GeocodeResult[] }
  >();

  constructor(private readonly http: HttpService) {}

  private get baseUrl(): string {
    return process.env.NOMINATIM_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async search(q: string): Promise<GeocodeResult[]> {
    const query = q?.trim() ?? "";
    if (!query) return [];

    const key = query.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.results;

    try {
      const response = await firstValueFrom(
        this.http.get<NominatimItem[]>(`${this.baseUrl}/search`, {
          params: {
            q: query,
            countrycodes: "bb",
            format: "json",
            addressdetails: 1,
            limit: 5,
          },
          headers: { "User-Agent": USER_AGENT },
        }),
      );

      const results = (response.data ?? [])
        .filter(
          (
            item,
          ): item is Required<Pick<NominatimItem, "display_name">> &
            NominatimItem =>
            typeof item.display_name === "string" &&
            typeof item.lat === "string" &&
            typeof item.lon === "string",
        )
        .map((item) => ({
          label: item.display_name as string,
          lat: item.lat as string,
          lon: item.lon as string,
        }));

      this.remember(key, results);
      return results;
    } catch (error) {
      this.logger.warn(
        `[geocode] lookup failed for "${query}": ${(error as Error).message}`,
      );
      return [];
    }
  }

  private remember(key: string, results: GeocodeResult[]): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expires: Date.now() + CACHE_TTL_MS, results });
  }
}
