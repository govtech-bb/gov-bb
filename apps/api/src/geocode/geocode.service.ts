import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

/** A single address suggestion returned to the client. */
export interface GeocodeResult {
  /** The full formatted address — shown in the suggestions dropdown. */
  label: string;
  lat: string;
  lon: string;
  /** Primary address line (name + street), for address line 1. */
  line1: string;
  /** Locality (town / district), for address line 2. */
  line2: string;
  /** Parish select value (e.g. `st-michael`), or "" when not resolved. */
  parish: string;
}

/** The subset of a Nominatim `/search` result we consume. */
interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
}

const DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org";
// Nominatim's usage policy requires a descriptive, identifying User-Agent.
const USER_AGENT = "gov.bb-forms/1.0 (https://gov.bb)";
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

// Barbados's 11 parishes → the `components/parish` select values. Keyed by a
// normalized name ("saint x" / "st. x" → "st x") so Nominatim's spelling
// ("Saint Michael") maps regardless of form.
const PARISH_VALUE_BY_NORMALIZED: Record<string, string> = {
  "christ church": "christ-church",
  "st andrew": "st-andrew",
  "st george": "st-george",
  "st james": "st-james",
  "st john": "st-john",
  "st joseph": "st-joseph",
  "st lucy": "st-lucy",
  "st michael": "st-michael",
  "st peter": "st-peter",
  "st philip": "st-philip",
  "st thomas": "st-thomas",
};

const normalizeParish = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

const parishValue = (raw: string): string =>
  PARISH_VALUE_BY_NORMALIZED[normalizeParish(raw)] ?? "";

const isPostcode = (part: string): boolean => /^bb\s?\d/i.test(part.trim());

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
        .map((item) => this.toResult(item));

      this.remember(key, results);
      return results;
    } catch (error) {
      this.logger.warn(
        `[geocode] lookup failed for "${query}": ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Split the formatted `display_name` into line 1 / line 2 / parish. Barbados
   * has no reliable structured street data, so this is deterministic string
   * parsing: drop the country and postcode, pull out the part matching a known
   * parish, treat the last remaining part as the locality (line 2) and the rest
   * as line 1. The parish is also matched against the `address` object as a
   * fallback.
   */
  private toResult(item: NominatimItem): GeocodeResult {
    const label = item.display_name as string;
    const address = item.address ?? {};

    let parish =
      Object.values(address)
        .map((v) => (v ? parishValue(v) : ""))
        .find(Boolean) ?? "";

    const parts = label
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => p.toLowerCase() !== "barbados" && !isPostcode(p));

    const remaining: string[] = [];
    for (const part of parts) {
      const value = parishValue(part);
      if (value) {
        parish ||= value;
        continue;
      }
      remaining.push(part);
    }

    const line2 = remaining.length > 1 ? (remaining.pop() as string) : "";
    const line1 = remaining.join(", ");

    return {
      label,
      lat: item.lat as string,
      lon: item.lon as string,
      line1,
      line2,
      parish,
    };
  }

  private remember(key: string, results: GeocodeResult[]): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expires: Date.now() + CACHE_TTL_MS, results });
  }
}
