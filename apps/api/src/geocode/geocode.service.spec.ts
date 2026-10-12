import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
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

  it("keeps a place suggestion, which has no coordinate until it is picked", async () => {
    const oval: GeocodeResult = {
      label: "Kensington Oval",
      line1: "Kensington Oval",
      line2: "",
      parish: "st-michael",
      placeId: "ChIJ-oval",
    };
    const primary = provider("google", async () => [oval]);
    expect(await new GeocodeService([primary]).search("kensin")).toEqual([
      oval,
    ]);
  });

  it("passes a valid session token to the provider and drops a malformed one", async () => {
    const primary = provider("google", async () => []);
    const service = new GeocodeService([primary]);

    await service.search("first", "0f8f-session_1");
    await service.search("second", "bad token!");

    expect(primary.search).toHaveBeenNthCalledWith(
      1,
      "first",
      "0f8f-session_1",
    );
    expect(primary.search).toHaveBeenNthCalledWith(2, "second", undefined);
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

  describe("resolve", () => {
    const places = (resolve: GeocodeProvider["resolve"]) => {
      const google = {
        ...provider("google", async () => []),
        resolve: vi.fn(resolve),
      };
      return { google, service: new GeocodeService([google]) };
    };

    it("looks the picked place up with the provider that suggested it", async () => {
      const { google, service } = places(async () => ({
        lat: "13.105",
        lon: "-59.6225",
        parish: "st-michael",
      }));

      expect(await service.resolve("ChIJ-oval", "session-1")).toEqual({
        lat: "13.105",
        lon: "-59.6225",
        parish: "st-michael",
      });
      expect(google.resolve).toHaveBeenCalledWith("ChIJ-oval", "session-1");
    });

    it("rejects a malformed place id before calling the provider", async () => {
      const { google, service } = places(async () => ({
        lat: "13.1",
        lon: "-59.6",
        parish: "",
      }));
      await expect(service.resolve("../admin")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(google.resolve).not.toHaveBeenCalled();
    });

    it("refuses a place outside Barbados", async () => {
      const { service } = places(async () => ({
        lat: "51.5",
        lon: "-0.12",
        parish: "",
      }));
      await expect(service.resolve("ChIJ-london")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws 503 when the lookup fails, so the field can offer a map pin", async () => {
      const { service } = places(async () => {
        throw new Error("quota");
      });
      await expect(service.resolve("ChIJ-oval")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("throws 404 when no provider can look a place up", async () => {
      const service = new GeocodeService([
        provider("nominatim", async () => []),
      ]);
      await expect(service.resolve("ChIJ-oval")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
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
