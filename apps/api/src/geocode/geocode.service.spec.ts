import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { of } from "rxjs";
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

const BRIDGETOWN = {
  ...result("13.0975", "-59.6145", "Bridgetown"),
  parish: "st-michael",
};
const OISTINS = {
  ...result("13.066", "-59.542", "Oistins"),
  parish: "christ-church",
};

function provider(
  name: string,
  search: GeocodeProvider["search"],
  cacheable = true,
): GeocodeProvider & { search: ReturnType<typeof vi.fn> } {
  return { name, cacheable, search: vi.fn(search) };
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

  // Places API (New) refuses a token longer than 36 characters.
  it("takes a 36-character session token (a v4 UUID) but drops a longer one", async () => {
    const primary = provider("google", async () => [], false);
    const service = new GeocodeService([primary]);
    const uuid = "0f8f6c2e-3b1a-4d5e-9f00-123456789abc";

    await service.search("first", uuid);
    await service.search("second", `${uuid}x`);

    expect(primary.search).toHaveBeenNthCalledWith(1, "first", uuid);
    expect(primary.search).toHaveBeenNthCalledWith(2, "second", undefined);
  });

  // A located address's parish is read-only, so it must come with the pick.
  it("works out the parish of a result that names none", async () => {
    const primary = provider("primary", async () => [
      { ...BRIDGETOWN, parish: "" },
    ]);
    const [found] = await new GeocodeService([primary]).search("Bridgetown");
    expect(found.parish).toBe("st-michael");
  });

  it("does not cache a fallback's answer", async () => {
    const primary = provider("primary", async () => [BRIDGETOWN]);
    primary.search.mockRejectedValueOnce(new Error("blip"));
    const fallback = provider("fallback", async () => [OISTINS]);
    const service = new GeocodeService([primary, fallback]);

    expect(await service.search("Bridgetown")).toEqual([OISTINS]);
    expect(await service.search("Bridgetown")).toEqual([BRIDGETOWN]);
  });

  // Google's terms allow caching only place IDs, not predictions.
  it("does not cache a provider whose terms forbid it", async () => {
    const google = provider("google", async () => [BRIDGETOWN], false);
    const service = new GeocodeService([google]);
    await service.search("Bridgetown");
    await service.search("Bridgetown");
    expect(google.search).toHaveBeenCalledTimes(2);
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

    it("works out the parish from the coordinate when the provider names none", async () => {
      // Kensington Mall: Google's Place Details carry no parish.
      const { service } = places(async () => ({
        lat: "13.105526",
        lon: "-59.624292",
        parish: "",
      }));
      expect((await service.resolve("ChIJ-mall")).parish).toBe("st-michael");
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

  describe("reverse", () => {
    const AT_OVAL = {
      ...result("13.105000", "-59.622500", "President Kennedy Dr"),
      parish: "st-michael",
    };
    const reverser = (name: string, reverse: GeocodeProvider["reverse"]) => ({
      ...provider(name, async () => []),
      reverse: vi.fn(reverse),
    });

    it("answers from the first provider that can", async () => {
      const google = reverser("google", async () => AT_OVAL);
      const service = new GeocodeService([google]);
      expect(await service.reverse(13.105, -59.6225)).toEqual(AT_OVAL);
      expect(google.reverse).toHaveBeenCalledWith(13.105, -59.6225);
    });

    it("falls back when the first provider fails", async () => {
      const google = reverser("google", async () => {
        throw new Error("quota");
      });
      const nominatim = reverser("nominatim", async () => AT_OVAL);
      expect(
        await new GeocodeService([google, nominatim]).reverse(13.105, -59.6225),
      ).toEqual(AT_OVAL);
    });

    it("asks the next provider when the first has no address at the point", async () => {
      const google = reverser("google", async () => null);
      const nominatim = reverser("nominatim", async () => AT_OVAL);
      expect(
        await new GeocodeService([google, nominatim]).reverse(13.105, -59.6225),
      ).toEqual(AT_OVAL);
    });

    it("works out the parish from the pin when the provider names none", async () => {
      const google = reverser("google", async () => ({
        ...AT_OVAL,
        parish: "",
      }));
      expect(
        (await new GeocodeService([google]).reverse(13.105, -59.6225)).parish,
      ).toBe("st-michael");
    });

    // The parish is read-only on a located address, so a pin must always come
    // back with one, even where there is no street address to name.
    it("returns just the parish when there is no address at the point", async () => {
      const google = reverser("google", async () => null);
      expect(await new GeocodeService([google]).reverse(13.2, -59.55)).toEqual({
        label: "",
        lat: "13.200000",
        lon: "-59.550000",
        line1: "",
        line2: "",
        parish: "st-joseph",
      });
    });

    it("returns just the parish when every provider fails", async () => {
      const google = reverser("google", async () => {
        throw new Error("down");
      });
      expect(
        (await new GeocodeService([google]).reverse(13.2, -59.55)).parish,
      ).toBe("st-joseph");
    });

    it.each([
      [Number.NaN, -59.5],
      [51.5, -0.12],
    ])("refuses a point outside Barbados (%s, %s)", async (lat, lon) => {
      const google = reverser("google", async () => AT_OVAL);
      await expect(
        new GeocodeService([google]).reverse(lat, lon),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(google.reverse).not.toHaveBeenCalled();
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

  it("passes NOMINATIM_BASE_URL to the Nominatim provider", async () => {
    const get = vi.fn().mockReturnValue(of({ data: [] }));
    const [nominatim] = buildProviders({ get } as unknown as HttpService, {
      NOMINATIM_BASE_URL: "https://geo.example.gov.bb",
    });
    await nominatim.search("bridgetown");
    expect(get.mock.calls[0][0]).toBe("https://geo.example.gov.bb/search");
  });

  it("warns at startup when no provider is configured", () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    try {
      expect(names({ GEOCODE_PROVIDERS: "google" })).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("no geocoding provider is configured"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses an unknown provider name rather than silently dropping it", () => {
    expect(() => names({ GEOCODE_PROVIDERS: "google,mapbox" })).toThrow(
      /unknown geocoding provider "mapbox"/,
    );
  });
});
