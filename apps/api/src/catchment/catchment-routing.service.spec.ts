import { afterEach, describe, expect, it, beforeAll, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";
import { PARISH_DEFAULTS, PROGRAMME_CODES } from "./polyclinic-routing";

describe("CatchmentRoutingService", () => {
  let svc: CatchmentRoutingService;
  beforeAll(() => {
    svc = new CatchmentRoutingService();
    svc.onModuleInit();
  });

  it("resolves a coordinate inside the Sir Winston Scott catchment", () => {
    // "lat,lon" — centroid of the Sir Winston Scott outer ring, confirmed
    // in-polygon (and not in any other catchment) via a throwaway script.
    const r = svc.resolve({ coordinates: "13.0901,-59.5861" });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
    expect(r?.programmeCode).toBe("TEMP-RESTAURANT-LICENCE-WINSTON-SCOTT");
    expect(r?.mdaEmail).toBe("ehd.wspc@health.gov.bb");
  });

  it("resolves a coordinate inside the MultiPolygon (Maurice Byer) catchment", () => {
    // Centroid of the larger Maurice Byer outer ring (the second polygon in
    // the MultiPolygon), confirmed in-polygon via a throwaway script.
    const r = svc.resolve({ coordinates: "13.2716,-59.6044" });
    expect(r?.polyclinic).toBe("Maurice Byer Polyclinic");
  });

  it("falls back to parish when coordinates are absent", () => {
    const r = svc.resolve({ parish: "christ-church" });
    expect(r?.polyclinic).toBe("Randal Phillips Polyclinic");
  });

  it("falls back to parish when coordinates land outside every catchment (sea)", () => {
    const r = svc.resolve({ coordinates: "13.5,-60.5", parish: "st-michael" });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
  });

  it("treats a lon,lat mix-up as offshore and uses the parish", () => {
    // Correct order for the WSS point is 13.0901,-59.5861; reversed lands in the sea.
    const r = svc.resolve({
      coordinates: "-59.5861,13.0901",
      parish: "st-thomas",
    });
    expect(r?.polyclinic).toBe("Eunice Gibson Polyclinic");
  });

  it("returns null when neither coordinates nor a known parish resolve", () => {
    expect(svc.resolve({})).toBeNull();
    expect(svc.resolve({ parish: "not-a-parish" })).toBeNull();
  });

  it("resolves Frederick Miller's programme code but a null email", () => {
    // Centroid of the Frederick Miller outer ring, confirmed in-polygon via a
    // throwaway script. The GeoJSON has no `email` property for this
    // catchment at all.
    const r = svc.resolve({ coordinates: "13.1323,-59.5626" });
    expect(r?.polyclinic).toBe("Frederick Miller Polyclinic");
    expect(r?.programmeCode).toBe("TEMP-RESTAURANT-LICENCE-FREDERICK-MILLER");
    expect(r?.mdaEmail).toBeNull();
  });

  it("logs a boot warning naming the emailless catchment (Frederick Miller)", () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    new CatchmentRoutingService().onModuleInit();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Frederick Miller Polyclinic"),
    );
    warnSpy.mockRestore();
  });
});

describe("CatchmentRoutingService boot validation (mocked data)", () => {
  afterEach(() => {
    vi.doUnmock("./polyclinic-routing");
    vi.resetModules();
  });

  it("throws when a GeoJSON catchment has no PROGRAMME_CODES entry", async () => {
    const { "Sir Winston Scott Polyclinic": _omit, ...rest } = PROGRAMME_CODES;
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES: rest,
      PARISH_DEFAULTS,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Sir Winston Scott Polyclinic/);
  });

  it("throws when a PARISH_DEFAULTS value names an unknown catchment", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES,
      PARISH_DEFAULTS: {
        ...PARISH_DEFAULTS,
        "st-lucy": "Not A Real Polyclinic",
      },
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/PARISH_DEFAULTS/);
  });
});
