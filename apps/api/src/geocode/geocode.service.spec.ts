import type { Mock } from "vitest";
import { of, throwError } from "rxjs";
import { GeocodeService } from "./geocode.service";

function makeService(get: Mock) {
  const http = { get } as unknown as ConstructorParameters<
    typeof GeocodeService
  >[0];
  return new GeocodeService(http);
}

describe("GeocodeService", () => {
  it("returns [] for a blank query without calling upstream", async () => {
    const get = vi.fn();
    const results = await makeService(get).search("   ");
    expect(results).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("locks the Nominatim query to Barbados and maps the results", async () => {
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

    const results = await makeService(get).search("Chefette");

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

    const [result] = await makeService(get).search("Oistins");
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
    const [result] = await makeService(get).search("nowhere");
    expect(result.parish).toBe("");
  });

  it("drops results missing coordinates", async () => {
    const get = vi
      .fn()
      .mockReturnValue(
        of({ data: [{ display_name: "Somewhere in Barbados" }] }),
      );
    expect(await makeService(get).search("somewhere")).toEqual([]);
  });

  it("resolves [] when the upstream call fails", async () => {
    const get = vi
      .fn()
      .mockReturnValue(throwError(() => new Error("connection refused")));
    expect(await makeService(get).search("anything")).toEqual([]);
  });

  it("serves a repeated query from cache (one upstream call)", async () => {
    const get = vi.fn().mockReturnValue(of({ data: [] }));
    const service = makeService(get);
    await service.search("Speightstown");
    await service.search("speightstown");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("returns [] for an undefined query without calling upstream", async () => {
    const get = vi.fn();
    const results = await makeService(get).search(
      undefined as unknown as string,
    );
    expect(results).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns [] when the upstream response carries no data", async () => {
    const get = vi.fn().mockReturnValue(of({}));
    expect(await makeService(get).search("bridgetown")).toEqual([]);
  });

  it("drops a result missing its longitude", async () => {
    const get = vi
      .fn()
      .mockReturnValue(
        of({ data: [{ display_name: "Bay Street, Barbados", lat: "13.1" }] }),
      );
    expect(await makeService(get).search("bay street")).toEqual([]);
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
    const [result] = await makeService(get).search("bay street");
    expect(result.parish).toBe("st-michael");
    expect(result.line1).toBe("Bay Street");
    expect(result.line2).toBe("Bridgetown");
  });

  it("resolves against a configurable base URL (NOMINATIM_BASE_URL)", async () => {
    const previous = process.env.NOMINATIM_BASE_URL;
    process.env.NOMINATIM_BASE_URL = "https://geo.example.gov.bb";
    try {
      const get = vi.fn().mockReturnValue(of({ data: [] }));
      await makeService(get).search("bridgetown");
      expect(get.mock.calls[0][0]).toBe("https://geo.example.gov.bb/search");
    } finally {
      if (previous === undefined) delete process.env.NOMINATIM_BASE_URL;
      else process.env.NOMINATIM_BASE_URL = previous;
    }
  });

  it("evicts the oldest entry once the cache is full", async () => {
    const get = vi
      .fn()
      .mockReturnValue(
        of({ data: [{ display_name: "X, Barbados", lat: "1", lon: "2" }] }),
      );
    const service = makeService(get);
    await service.search("q-first");
    for (let i = 0; i < 210; i++) await service.search(`q-fill-${i}`);
    const callsBefore = get.mock.calls.length;
    // q-first was evicted, so this misses the cache and hits upstream again.
    await service.search("q-first");
    expect(get.mock.calls.length).toBe(callsBefore + 1);
  });

  it("refetches once a cached entry has expired", async () => {
    vi.useFakeTimers();
    try {
      const get = vi.fn().mockReturnValue(of({ data: [] }));
      const service = makeService(get);
      await service.search("bridgetown");
      vi.advanceTimersByTime(60 * 60 * 1000 + 1); // past the 1h TTL
      await service.search("bridgetown");
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
