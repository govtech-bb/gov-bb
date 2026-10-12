import type { Mock } from "vitest";
import { of, throwError } from "rxjs";
import { GoogleProvider } from "./google.provider";

function makeProvider(http: { get?: Mock; post?: Mock }) {
  return new GoogleProvider(
    http as unknown as ConstructorParameters<typeof GoogleProvider>[0],
    "test-key",
  );
}

const respond = (data: unknown) => vi.fn().mockReturnValue(of({ data }));

// Shapes taken from live Places API (New) responses for Barbados.
const KENSINGTON_OVAL = {
  placePrediction: {
    placeId: "ChIJ-oval",
    text: {
      text: "Kensington Oval, President Kennedy Drive, Bridgetown, Saint Michael, Barbados",
      matches: [{ endOffset: 10 }],
    },
    structuredFormat: {
      mainText: { text: "Kensington Oval", matches: [{ endOffset: 10 }] },
      secondaryText: {
        text: "President Kennedy Drive, Bridgetown, Saint Michael, Barbados",
      },
    },
    types: ["establishment", "point_of_interest", "stadium"],
  },
};

const GUN_HILL = {
  placePrediction: {
    placeId: "ChIJ-gun-hill",
    text: { text: "Gun Hill, Saint George Barbados" },
    structuredFormat: {
      mainText: {
        text: "Gun Hill",
        matches: [{ startOffset: 0, endOffset: 3 }],
      },
      secondaryText: { text: "Saint George Barbados" },
    },
    types: ["locality", "political"],
  },
};

describe("GoogleProvider", () => {
  describe("search (Places Autocomplete)", () => {
    it("asks for Barbados-only predictions within the island's bounds", async () => {
      const post = respond({ suggestions: [] });

      await makeProvider({ post }).search("kensin", "session-1");

      const [url, body, config] = post.mock.calls[0];
      expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
      expect(body).toEqual({
        input: "kensin",
        includedRegionCodes: ["bb"],
        locationRestriction: {
          rectangle: {
            low: { latitude: 13.03, longitude: -59.66 },
            high: { latitude: 13.34, longitude: -59.41 },
          },
        },
        sessionToken: "session-1",
      });
      expect(config.headers).toEqual({ "X-Goog-Api-Key": "test-key" });
    });

    it("leaves the session token out when there is none", async () => {
      const post = respond({ suggestions: [] });
      await makeProvider({ post }).search("kensin");
      expect(post.mock.calls[0][1]).not.toHaveProperty("sessionToken");
    });

    it("maps a named place: its name is line 1, the street and town line 2", async () => {
      const post = respond({ suggestions: [KENSINGTON_OVAL] });

      const [result] = await makeProvider({ post }).search("kensin");

      expect(result).toEqual({
        label:
          "Kensington Oval, President Kennedy Drive, Bridgetown, Saint Michael, Barbados",
        placeId: "ChIJ-oval",
        mainText: "Kensington Oval",
        secondaryText:
          "President Kennedy Drive, Bridgetown, Saint Michael, Barbados",
        matches: [{ start: 0, end: 10 }],
        line1: "Kensington Oval",
        line2: "President Kennedy Drive, Bridgetown",
        parish: "st-michael",
      });
      // No coordinate until the applicant picks it.
      expect(result).not.toHaveProperty("lat");
    });

    it("keeps Google's run-together parish and country out of line 2", async () => {
      const post = respond({ suggestions: [GUN_HILL] });

      const [result] = await makeProvider({ post }).search("gun");

      expect(result).toMatchObject({
        line1: "Gun Hill",
        line2: "",
        parish: "st-george",
        matches: [{ start: 0, end: 3 }],
      });
    });

    it("drops a country prediction, whose centroid would mis-route the case", async () => {
      const post = respond({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJ-barbados",
              text: { text: "Barbados" },
              structuredFormat: { mainText: { text: "Barbados" } },
              types: ["country", "political"],
            },
          },
          GUN_HILL,
        ],
      });

      const results = await makeProvider({ post }).search("barb");

      expect(results.map((r) => r.placeId)).toEqual(["ChIJ-gun-hill"]);
    });

    it("skips query predictions, which name no place", async () => {
      const post = respond({
        suggestions: [{ queryPrediction: { text: { text: "pizza" } } }],
      });
      expect(await makeProvider({ post }).search("pizza")).toEqual([]);
    });

    it("returns [] when nothing matches", async () => {
      const post = respond({});
      expect(await makeProvider({ post }).search("zzzz")).toEqual([]);
    });

    it("rejects when the call fails (quota, bad key, outage) so the service falls back", async () => {
      const post = vi
        .fn()
        .mockReturnValue(
          throwError(() => new Error("Request failed with status code 429")),
        );
      await expect(makeProvider({ post }).search("gun")).rejects.toThrow("429");
    });
  });

  describe("resolve (Place Details)", () => {
    const OVAL_DETAILS = {
      location: { latitude: 13.1049948, longitude: -59.6225241 },
      addressComponents: [
        { longText: "Bridgetown", types: ["locality", "political"] },
        {
          longText: "Saint Michael",
          types: ["administrative_area_level_1", "political"],
        },
      ],
    };

    it("asks only for the location and address parts, in the same session", async () => {
      const get = respond(OVAL_DETAILS);

      await makeProvider({ get }).resolve("ChIJ-oval", "session-1");

      const [url, config] = get.mock.calls[0];
      expect(url).toBe("https://places.googleapis.com/v1/places/ChIJ-oval");
      expect(config.params).toEqual({ sessionToken: "session-1" });
      expect(config.headers).toEqual({
        "X-Goog-Api-Key": "test-key",
        "X-Goog-FieldMask": "location,addressComponents",
      });
    });

    it("returns the coordinate and parish", async () => {
      const get = respond(OVAL_DETAILS);
      expect(await makeProvider({ get }).resolve("ChIJ-oval")).toEqual({
        lat: "13.104995",
        lon: "-59.622524",
        parish: "st-michael",
      });
    });

    it("escapes the place id into the path", async () => {
      const get = respond(OVAL_DETAILS);
      await makeProvider({ get }).resolve("a/b");
      expect(get.mock.calls[0][0]).toBe(
        "https://places.googleapis.com/v1/places/a%2Fb",
      );
    });

    it("rejects when the place has no location", async () => {
      const get = respond({ addressComponents: [] });
      await expect(makeProvider({ get }).resolve("ChIJ-x")).rejects.toThrow(
        "no location",
      );
    });
  });
});
