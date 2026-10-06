import { ServiceUnavailableException } from "@nestjs/common";
import type { HttpService } from "@nestjs/axios";
import { GeocodeProvider, GeocodeResult } from "./geocode-result";
import { buildProviders, GeocodeService } from "./geocode.service";

const result = (
  lat: string,
  lon: string,
  label = "Somewhere",
): GeocodeResult => ({
  label,
  lat,
  lon,
  line1: label,
  line2: "",
  parish: "",
});

const BRIDGETOWN = result("13.0975", "-59.6145", "Bridgetown");
const OISTINS = result("13.066", "-59.542", "Oistins");

function provider(
  name: string,
  search: GeocodeProvider["search"],
): GeocodeProvider & { search: ReturnType<typeof vi.fn> } {
  return { name, search: vi.fn(search) };
}

describe("GeocodeService", () => {
  it("returns [] for a blank or missing query without calling a provider", async () => {
    const primary = provider("primary", async () => [BRIDGETOWN]);
    const service = new GeocodeService([primary]);
    expect(await service.search("   ")).toEqual([]);
    expect(await service.search(undefined as unknown as string)).toEqual([]);
    expect(primary.search).not.toHaveBeenCalled();
  });

  it("answers from the primary provider without touching the fallback", async () => {
    const primary = provider("primary", async () => [BRIDGETOWN]);
    const fallback = provider("fallback", async () => [OISTINS]);
    const service = new GeocodeService([primary, fallback]);

    expect(await service.search("Bridgetown")).toEqual([BRIDGETOWN]);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it("treats the primary's empty answer as final (no fallback spend)", async () => {
    const primary = provider("primary", async () => []);
    const fallback = provider("fallback", async () => [OISTINS]);
    const service = new GeocodeService([primary, fallback]);

    expect(await service.search("nowhere")).toEqual([]);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it("falls back when the primary's quota is exhausted", async () => {
    const primary = provider("google", async () => {
      throw new Error("status OVER_DAILY_LIMIT");
    });
    const fallback = provider("nominatim", async () => [OISTINS]);
    const service = new GeocodeService([primary, fallback]);

    expect(await service.search("Oistins")).toEqual([OISTINS]);
  });

  it("falls back when the primary errors", async () => {
    const primary = provider("google", async () => {
      throw new Error("socket hang up");
    });
    const fallback = provider("nominatim", async () => [BRIDGETOWN]);
    const service = new GeocodeService([primary, fallback]);

    expect(await service.search("Bridgetown")).toEqual([BRIDGETOWN]);
  });

  it("throws 503 when every provider fails, so the field can offer a map pin", async () => {
    const failing = () =>
      provider("down", async () => {
        throw new Error("down");
      });
    const service = new GeocodeService([failing(), failing()]);

    await expect(service.search("Bridgetown")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("throws 503 when no provider is configured", async () => {
    await expect(new GeocodeService([]).search("x")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("drops results outside the bounds of Barbados", async () => {
    const primary = provider("primary", async () => [
      result("13.1", "-61.2", "Kingstown, St Vincent"),
      BRIDGETOWN,
      result("51.5", "-0.12", "Bridge Street, London"),
      result("not", "a number"),
    ]);
    expect(await new GeocodeService([primary]).search("bridge")).toEqual([
      BRIDGETOWN,
    ]);
  });

  it("does not cache a failure", async () => {
    const primary = provider("primary", async () => [BRIDGETOWN]);
    primary.search.mockRejectedValueOnce(new Error("blip"));
    const service = new GeocodeService([primary]);

    await expect(service.search("Bridgetown")).rejects.toThrow();
    expect(await service.search("Bridgetown")).toEqual([BRIDGETOWN]);
  });

  it("serves a repeated query from cache (one upstream call)", async () => {
    const primary = provider("primary", async () => []);
    const service = new GeocodeService([primary]);
    await service.search("Speightstown");
    await service.search("speightstown");
    expect(primary.search).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entry once the cache is full", async () => {
    const primary = provider("primary", async () => [BRIDGETOWN]);
    const service = new GeocodeService([primary]);
    await service.search("q-first");
    for (let i = 0; i < 210; i++) await service.search(`q-fill-${i}`);
    const callsBefore = primary.search.mock.calls.length;
    // q-first was evicted, so this misses the cache and hits upstream again.
    await service.search("q-first");
    expect(primary.search.mock.calls.length).toBe(callsBefore + 1);
  });

  it("refetches once a cached entry has expired", async () => {
    vi.useFakeTimers();
    try {
      const primary = provider("primary", async () => []);
      const service = new GeocodeService([primary]);
      await service.search("bridgetown");
      vi.advanceTimersByTime(60 * 60 * 1000 + 1); // past the 1h TTL
      await service.search("bridgetown");
      expect(primary.search).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("buildProviders", () => {
  const http = {} as HttpService;
  const names = (env: NodeJS.ProcessEnv) =>
    buildProviders(http, env).map((p) => p.name);

  it("defaults to Google first, Nominatim as the fallback", () => {
    expect(names({ GOOGLE_GEOCODING_API_KEY: "k" })).toEqual([
      "google",
      "nominatim",
    ]);
  });

  it("leaves Google out until a key is set", () => {
    expect(names({})).toEqual(["nominatim"]);
    expect(names({ GOOGLE_GEOCODING_API_KEY: "  " })).toEqual(["nominatim"]);
  });

  it("takes the order from GEOCODE_PROVIDERS", () => {
    expect(
      names({
        GEOCODE_PROVIDERS: " Nominatim , google ",
        GOOGLE_GEOCODING_API_KEY: "k",
      }),
    ).toEqual(["nominatim", "google"]);
    expect(names({ GEOCODE_PROVIDERS: "nominatim" })).toEqual(["nominatim"]);
  });

  it("refuses an unknown provider name rather than silently dropping it", () => {
    expect(() => names({ GEOCODE_PROVIDERS: "google,mapbox" })).toThrow(
      /unknown geocoding provider "mapbox"/,
    );
  });
});
