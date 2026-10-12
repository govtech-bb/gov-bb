import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import {
  GeocodeProvider,
  GeocodeResult,
  isWithinBarbados,
  ResolvedPlace,
} from "./geocode-result";
import { GoogleProvider } from "./providers/google.provider";
import { NominatimProvider } from "./providers/nominatim.provider";

export type { GeocodeResult, ResolvedPlace } from "./geocode-result";

/** DI token for the ordered provider chain built by {@link buildProviders}. */
export const GEOCODE_PROVIDERS = Symbol("GEOCODE_PROVIDERS");

const DEFAULT_PROVIDER_ORDER = "google,nominatim";
// Both go into an upstream URL or body, so only plain token characters pass.
const PLACE_ID = /^[\w-]{1,512}$/;
const SESSION_TOKEN = /^[\w-]{1,64}$/;

/** The session token if well-formed; a malformed one is dropped, not fatal. */
const validSessionToken = (session?: string): string | undefined =>
  session && SESSION_TOKEN.test(session) ? session : undefined;
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

  async search(q: string, session?: string): Promise<GeocodeResult[]> {
    const query = q?.trim() ?? "";
    if (!query) return [];
    const sessionToken = validSessionToken(session);

    const key = query.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.results;

    for (const provider of this.providers) {
      try {
        const results = (await provider.search(query, sessionToken)).filter(
          (r) =>
            // A place suggestion has no coordinate yet — the provider kept it
            // to Barbados, and resolve() checks the coordinate once picked.
            (r.placeId !== undefined && r.lat === undefined) ||
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

  /**
   * The coordinate (and parish) of a place suggestion the applicant picked.
   * 404 when it cannot be placed in Barbados; 503 when the lookup fails, so the
   * address field can offer the map pin instead.
   */
  async resolve(placeId: string, session?: string): Promise<ResolvedPlace> {
    if (!PLACE_ID.test(placeId ?? "")) {
      throw new BadRequestException("Invalid place id");
    }
    const provider = this.providers.find((p) => p.resolve);
    if (!provider?.resolve) throw new NotFoundException("Place not found");

    let place: ResolvedPlace;
    try {
      place = await provider.resolve(placeId, validSessionToken(session));
    } catch (error) {
      this.logger.warn(
        `[geocode] ${provider.name} place lookup failed for "${placeId}": ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException("Address lookup is unavailable");
    }
    if (!isWithinBarbados(Number(place.lat), Number(place.lon))) {
      throw new NotFoundException("Place not found");
    }
    return place;
  }

  /**
   * The address at a pin the applicant placed on the map, from the first
   * provider that can answer. 404 when there is no address there; 503 when no
   * provider could answer.
   */
  async reverse(lat: number, lon: number): Promise<GeocodeResult> {
    if (!isWithinBarbados(lat, lon)) {
      throw new BadRequestException("The point is not in Barbados");
    }
    for (const provider of this.providers) {
      if (!provider.reverse) continue;
      let found: GeocodeResult | null;
      try {
        found = await provider.reverse(lat, lon);
      } catch (error) {
        this.logger.warn(
          `[geocode] ${provider.name} reverse lookup failed for ${lat},${lon}: ${(error as Error).message}`,
        );
        continue;
      }
      // An empty answer is final, as for search.
      if (!found) throw new NotFoundException("No address at that point");
      return found;
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
