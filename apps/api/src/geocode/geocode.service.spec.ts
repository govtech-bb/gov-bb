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
    const get = vi
      .fn()
      .mockReturnValue(
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
});
