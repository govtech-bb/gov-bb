import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import {
  GeocodeProvider,
  GeocodeResult,
  isWithinBarbados,
} from "./geocode-result";
import { GoogleProvider } from "./providers/google.provider";
import { NominatimProvider } from "./providers/nominatim.provider";

export type { GeocodeResult } from "./geocode-result";

/** DI token for the ordered provider chain built by {@link buildProviders}. */
export const GEOCODE_PROVIDERS = Symbol("GEOCODE_PROVIDERS");

const DEFAULT_PROVIDER_ORDER = "google,nominatim";
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/**
 * Build the provider chain from `GEOCODE_PROVIDERS` — a comma-separated order,
 * primary first (default `google,nominatim`). Which service is primary and
 * which is the fallback is configuration, not code. Google is left out until
 * `GOOGLE_GEOCODING_API_KEY` is set, so an environment without a key runs on
 * the next provider in the list.
 */
export function buildProviders(
  http: HttpService,
  env: NodeJS.ProcessEnv,
): GeocodeProvider[] {
  const order = (env.GEOCODE_PROVIDERS ?? DEFAULT_PROVIDER_ORDER)
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  const providers: GeocodeProvider[] = [];
  for (const name of order) {
    if (name === "google") {
      const key = env.GOOGLE_GEOCODING_API_KEY?.trim();
      if (key) providers.push(new GoogleProvider(http, key));
    } else if (name === "nominatim") {
      providers.push(new NominatimProvider(http));
    } else {
      throw new Error(
        `GEOCODE_PROVIDERS: unknown geocoding provider "${name}"`,
      );
    }
  }
  return providers;
}

/**
 * Barbados-only address lookup over an ordered chain of geocoding providers.
 * Keeps the outbound call server-side so we control credentials, can cache, and
 * can change provider by configuration with no client change.
 *
 * Each provider is tried in order until one answers; a provider that fails
 * (outage, quota or budget reached) falls through to the next. Results outside
 * Barbados are dropped whichever provider returned them. When no provider can
 * answer, the lookup throws 503 so the address field can offer the applicant a
 * map pin instead — an empty list would read as "no such address".
 */
@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private readonly cache = new Map<
    string,
    { expires: number; results: GeocodeResult[] }
  >();

  constructor(
    @Inject(GEOCODE_PROVIDERS) private readonly providers: GeocodeProvider[],
  ) {}

  async search(q: string): Promise<GeocodeResult[]> {
    const query = q?.trim() ?? "";
    if (!query) return [];

    const key = query.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.results;

    for (const provider of this.providers) {
      try {
        const results = (await provider.search(query)).filter((r) =>
          isWithinBarbados(Number(r.lat), Number(r.lon)),
        );
        this.remember(key, results);
        return results;
      } catch (error) {
        this.logger.warn(
          `[geocode] ${provider.name} lookup failed for "${query}": ${(error as Error).message}`,
        );
      }
    }

    throw new ServiceUnavailableException("Address lookup is unavailable");
  }

  private remember(key: string, results: GeocodeResult[]): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expires: Date.now() + CACHE_TTL_MS, results });
  }
}
