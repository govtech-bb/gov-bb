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
            display_name: "Bay Street, Bridgetown, St. Michael, Barbados",
            lat: "13.0975",
            lon: "-59.6145",
          },
        ],
      }),
    );

    const results = await makeService(get).search("Bay Street");

    expect(results).toEqual([
      {
        label: "Bay Street, Bridgetown, St. Michael, Barbados",
        lat: "13.0975",
        lon: "-59.6145",
      },
    ]);

    const [url, config] = get.mock.calls[0];
    expect(url).toContain("/search");
    expect(config.params).toMatchObject({
      q: "Bay Street",
      countrycodes: "bb",
      format: "json",
      limit: 5,
    });
    expect(config.headers["User-Agent"]).toBeTruthy();
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
