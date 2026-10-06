import type { Mock } from "vitest";
import { of, throwError } from "rxjs";
import { GoogleProvider } from "./google.provider";

function makeProvider(get: Mock) {
  const http = { get } as unknown as ConstructorParameters<
    typeof GoogleProvider
  >[0];
  return new GoogleProvider(http, "test-key");
}

const respond = (data: unknown) => vi.fn().mockReturnValue(of({ data }));

const BROAD_STREET = {
  formatted_address: "Broad St, Bridgetown, St Michael, Barbados",
  geometry: { location: { lat: 13.0969, lng: -59.6146 } },
  address_components: [
    { long_name: "Broad Street", types: ["route"] },
    { long_name: "Bridgetown", types: ["locality", "political"] },
    {
      long_name: "Saint Michael",
      types: ["administrative_area_level_1", "political"],
    },
    { long_name: "Barbados", types: ["country", "political"] },
  ],
  types: ["route"],
};

describe("GoogleProvider", () => {
  it("restricts the query to Barbados and maps the results", async () => {
    const get = respond({ status: "OK", results: [BROAD_STREET] });

    const results = await makeProvider(get).search("Broad Street");

    expect(results).toEqual([
      {
        label: "Broad St, Bridgetown, St Michael, Barbados",
        lat: "13.0969",
        lon: "-59.6146",
        line1: "Broad St",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);
    const [url, config] = get.mock.calls[0];
    expect(url).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(config.params).toEqual({
      address: "Broad Street",
      components: "country:BB",
      bounds: "13.03,-59.66|13.34,-59.41",
      key: "test-key",
    });
  });

  it("takes the parish from administrative_area_level_1 when the address omits it", async () => {
    const get = respond({
      status: "OK",
      results: [
        {
          ...BROAD_STREET,
          formatted_address: "Main Rd, Oistins, Barbados",
          address_components: [
            {
              long_name: "Christ Church",
              types: ["administrative_area_level_1"],
            },
          ],
        },
      ],
    });
    const [result] = await makeProvider(get).search("Oistins");
    expect(result.parish).toBe("christ-church");
  });

  it("returns [] for ZERO_RESULTS", async () => {
    const get = respond({ status: "ZERO_RESULTS", results: [] });
    expect(await makeProvider(get).search("nowhere")).toEqual([]);
  });

  it("drops a country-level match, whose centroid would mis-route the case", async () => {
    const get = respond({
      status: "OK",
      results: [
        {
          formatted_address: "Barbados",
          geometry: { location: { lat: 13.193887, lng: -59.543198 } },
          types: ["country", "political"],
        },
      ],
    });
    expect(await makeProvider(get).search("asdfgh")).toEqual([]);
  });

  it("drops results missing coordinates and caps the list at five", async () => {
    const get = respond({
      status: "OK",
      results: [
        { formatted_address: "No geometry, Barbados" },
        ...Array.from({ length: 7 }, () => BROAD_STREET),
      ],
    });
    expect(await makeProvider(get).search("broad")).toHaveLength(5);
  });

  it.each([
    "OVER_DAILY_LIMIT",
    "OVER_QUERY_LIMIT",
    "REQUEST_DENIED",
    "UNKNOWN_ERROR",
  ])("rejects on %s so the service falls back", async (status) => {
    const get = respond({ status, error_message: "nope", results: [] });
    await expect(makeProvider(get).search("broad")).rejects.toThrow(status);
  });

  it("rejects when the HTTP call fails", async () => {
    const get = vi
      .fn()
      .mockReturnValue(throwError(() => new Error("socket hang up")));
    await expect(makeProvider(get).search("broad")).rejects.toThrow(
      "socket hang up",
    );
  });
});
