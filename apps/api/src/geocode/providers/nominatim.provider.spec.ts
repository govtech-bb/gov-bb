import type { Mock } from "vitest";
import { of, throwError } from "rxjs";
import { NominatimProvider } from "./nominatim.provider";

function makeProvider(get: Mock) {
  const http = { get } as unknown as ConstructorParameters<
    typeof NominatimProvider
  >[0];
  return new NominatimProvider(http);
}

describe("NominatimProvider", () => {
  it("restricts the query to Barbados (country code + bounded viewbox) and maps the results", async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: [
          {
            display_name:
              "Chefette, Prescott Boulevard, Bridgetown, Saint Michael, BB11007, Barbados",
            lat: "13.0975",
            lon: "-59.6145",
          },
        ],
      }),
    );

    const results = await makeProvider(get).search("Chefette");

    expect(results).toEqual([
      {
        label:
          "Chefette, Prescott Boulevard, Bridgetown, Saint Michael, BB11007, Barbados",
        lat: "13.0975",
        lon: "-59.6145",
        line1: "Chefette, Prescott Boulevard",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);

    const [url, config] = get.mock.calls[0];
    expect(url).toContain("/search");
    expect(config.params).toMatchObject({
      q: "Chefette",
      countrycodes: "bb",
      viewbox: "-59.66,13.34,-59.41,13.03",
      bounded: 1,
      format: "json",
      addressdetails: 1,
      limit: 5,
    });
    expect(config.headers["User-Agent"]).toBeTruthy();
  });

  it("resolves the parish from the address object when absent from display_name", async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: [
          {
            display_name: "Some Road, Oistins, BB15000, Barbados",
            lat: "13.0",
            lon: "-59.5",
            address: { county: "Christ Church" },
          },
        ],
      }),
    );

    const [result] = await makeProvider(get).search("Oistins");
    expect(result.parish).toBe("christ-church");
    expect(result.line1).toBe("Some Road");
    expect(result.line2).toBe("Oistins");
  });

  it("leaves parish empty when nothing matches a Barbados parish", async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: [{ display_name: "Nowhere, Barbados", lat: "1", lon: "2" }],
      }),
    );
    const [result] = await makeProvider(get).search("nowhere");
    expect(result.parish).toBe("");
  });

  it("keeps the address-object parish when display_name also names it", async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: [
          {
            display_name: "Bay Street, Bridgetown, Saint Michael, Barbados",
            lat: "13.1",
            lon: "-59.6",
            address: { state: "Saint Michael" },
          },
        ],
      }),
    );
    const [result] = await makeProvider(get).search("bay street");
    expect(result.parish).toBe("st-michael");
    expect(result.line1).toBe("Bay Street");
    expect(result.line2).toBe("Bridgetown");
  });

  it("drops results missing coordinates", async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: [
          { display_name: "Somewhere in Barbados" },
          { display_name: "Bay Street, Barbados", lat: "13.1" },
        ],
      }),
    );
    expect(await makeProvider(get).search("somewhere")).toEqual([]);
  });

  it("returns [] when the response carries no data", async () => {
    const get = vi.fn().mockReturnValue(of({}));
    expect(await makeProvider(get).search("bridgetown")).toEqual([]);
  });

  it("rejects when the upstream call fails, so the service can fall back", async () => {
    const get = vi
      .fn()
      .mockReturnValue(throwError(() => new Error("connection refused")));
    await expect(makeProvider(get).search("anything")).rejects.toThrow(
      "connection refused",
    );
  });

  it("resolves against a configurable base URL (NOMINATIM_BASE_URL)", async () => {
    const previous = process.env.NOMINATIM_BASE_URL;
    process.env.NOMINATIM_BASE_URL = "https://geo.example.gov.bb";
    try {
      const get = vi.fn().mockReturnValue(of({ data: [] }));
      await makeProvider(get).search("bridgetown");
      expect(get.mock.calls[0][0]).toBe("https://geo.example.gov.bb/search");
    } finally {
      if (previous === undefined) delete process.env.NOMINATIM_BASE_URL;
      else process.env.NOMINATIM_BASE_URL = previous;
    }
  });
});
