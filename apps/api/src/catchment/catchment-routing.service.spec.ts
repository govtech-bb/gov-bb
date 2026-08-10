import { afterEach, describe, expect, it, beforeAll, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";
import {
  PARISH_DEFAULTS,
  POLYCLINIC_EMAILS,
  PROGRAMME_CODES_BY_FORM,
} from "./polyclinic-routing";

const LICENCE_FORM = "apply-for-temporary-restaurant-licence";
const OFFICER_FORM = "request-an-environmental-health-officer";

describe("CatchmentRoutingService", () => {
  let svc: CatchmentRoutingService;
  beforeAll(() => {
    svc = new CatchmentRoutingService();
    svc.onModuleInit();
  });

  it("resolves a coordinate inside the Sir Winston Scott catchment", () => {
    // "lat,lon" — centroid of the Sir Winston Scott outer ring, confirmed
    // in-polygon (and not in any other catchment) via a throwaway script.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "13.0901,-59.5861",
    });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
    expect(r?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT");
    expect(r?.mdaEmail).toBe("testing@govtech.bb");
  });

  it("resolves a coordinate inside the MultiPolygon (Maurice Byer) catchment", () => {
    // Centroid of the larger Maurice Byer outer ring (the second polygon in
    // the MultiPolygon), confirmed in-polygon via a throwaway script.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "13.2716,-59.6044",
    });
    expect(r?.polyclinic).toBe("Maurice Byer Polyclinic");
  });

  it("falls back to parish when coordinates are absent", () => {
    const r = svc.resolve({ formId: LICENCE_FORM, parish: "christ-church" });
    expect(r?.polyclinic).toBe("Randal Phillips Polyclinic");
  });

  it("falls back to parish when coordinates land outside every catchment (sea)", () => {
    const r = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "13.5,-60.5",
      parish: "st-michael",
    });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
  });

  it("treats a lon,lat mix-up as offshore and uses the parish", () => {
    // Correct order for the WSS point is 13.0901,-59.5861; reversed lands in the sea.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "-59.5861,13.0901",
      parish: "st-thomas",
    });
    expect(r?.polyclinic).toBe("Eunice Gibson Polyclinic");
  });

  it("returns null when neither coordinates nor a known parish resolve", () => {
    expect(svc.resolve({ formId: LICENCE_FORM })).toBeNull();
    expect(
      svc.resolve({ formId: LICENCE_FORM, parish: "not-a-parish" }),
    ).toBeNull();
  });

  it("resolves Frederick Miller's programme code and its (test-inbox) email", () => {
    // Centroid of the Frederick Miller outer ring, confirmed in-polygon via a
    // throwaway script.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "13.1323,-59.5626",
    });
    expect(r?.polyclinic).toBe("Frederick Miller Polyclinic");
    expect(r?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_ST_PHILIP");
    expect(r?.mdaEmail).toBe("testing@govtech.bb");
  });

  it("falls back to parish when the coordinate string is malformed (wrong part count)", () => {
    expect(
      svc.resolve({
        formId: LICENCE_FORM,
        coordinates: "13.1",
        parish: "st-michael",
      })?.polyclinic,
    ).toBe("Sir Winston Scott Polyclinic");
    expect(
      svc.resolve({
        formId: LICENCE_FORM,
        coordinates: "1,2,3",
        parish: "st-michael",
      })?.polyclinic,
    ).toBe("Sir Winston Scott Polyclinic");
  });

  it("falls back to parish when the coordinate string is non-numeric", () => {
    const r = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "north,west",
      parish: "st-thomas",
    });
    expect(r?.polyclinic).toBe("Eunice Gibson Polyclinic");
  });

  it("does not warn at boot when every catchment has an email", () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    new CatchmentRoutingService().onModuleInit();
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("no Ministry email"),
    );
    warnSpy.mockRestore();
  });

  it("resolves the officer-request formId to its matching ENV_HEALTH_OFFICER_* code for the same coordinate (regression: licence routing unchanged, per-form codes differ)", () => {
    const licence = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "13.0901,-59.5861",
    });
    const officer = svc.resolve({
      formId: OFFICER_FORM,
      coordinates: "13.0901,-59.5861",
    });
    expect(licence?.polyclinic).toBe("Sir Winston Scott Polyclinic");
    expect(licence?.programmeCode).toBe(
      "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
    );
    expect(officer?.polyclinic).toBe("Sir Winston Scott Polyclinic");
    expect(officer?.programmeCode).toBe("ENV_HEALTH_OFFICER_WINSTON_SCOTT");
  });

  it("resolves Frederick Miller to each form's own St. Philip code — no per-form asymmetry", () => {
    // Same coordinate as the Frederick Miller test above, confirmed in-polygon
    // there. Frederick Miller has no Environmental Health Department of its
    // own, so both forms fall to their own St. Philip queue.
    const officer = svc.resolve({
      formId: OFFICER_FORM,
      coordinates: "13.1323,-59.5626",
    });
    expect(officer?.polyclinic).toBe("Frederick Miller Polyclinic");
    expect(officer?.programmeCode).toBe("ENV_HEALTH_OFFICER_ST_PHILIP");

    const licence = svc.resolve({
      formId: LICENCE_FORM,
      coordinates: "13.1323,-59.5626",
    });
    expect(licence?.polyclinic).toBe("Frederick Miller Polyclinic");
    expect(licence?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_ST_PHILIP");
  });

  it("returns null and logs an error for a formId with no programme-code map", () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const r = svc.resolve({
      formId: "not-a-real-form",
      coordinates: "13.0901,-59.5861",
    });
    expect(r).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("not-a-real-form"),
    );
    errorSpy.mockRestore();
  });
});

describe("CatchmentRoutingService boot validation (mocked data)", () => {
  afterEach(() => {
    vi.doUnmock("./polyclinic-routing");
    vi.resetModules();
  });

  it("throws when a GeoJSON catchment has no programme code entry for a form", async () => {
    const { "Sir Winston Scott Polyclinic": _omit, ...rest } =
      PROGRAMME_CODES_BY_FORM[LICENCE_FORM];
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM: {
        ...PROGRAMME_CODES_BY_FORM,
        [LICENCE_FORM]: rest,
      },
      PARISH_DEFAULTS,
      POLYCLINIC_EMAILS,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Sir Winston Scott Polyclinic/);
  });

  it("throws when a form's programme-code map has a key that is not a GeoJSON catchment name", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM: {
        ...PROGRAMME_CODES_BY_FORM,
        [LICENCE_FORM]: {
          ...PROGRAMME_CODES_BY_FORM[LICENCE_FORM],
          "Not A Real Polyclinic": "BOGUS_CODE",
        },
      },
      PARISH_DEFAULTS,
      POLYCLINIC_EMAILS,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Not A Real Polyclinic/);
  });

  it("throws when a PARISH_DEFAULTS value names an unknown catchment", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM,
      PARISH_DEFAULTS: {
        ...PARISH_DEFAULTS,
        "st-lucy": "Not A Real Polyclinic",
      },
      POLYCLINIC_EMAILS,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/PARISH_DEFAULTS/);
  });

  it("warns at boot naming a catchment with no email", async () => {
    const { "Sir Winston Scott Polyclinic": _omit, ...emails } =
      POLYCLINIC_EMAILS;
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM,
      PARISH_DEFAULTS,
      POLYCLINIC_EMAILS: emails,
    }));
    vi.resetModules();
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    new Svc().onModuleInit();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sir Winston Scott Polyclinic"),
    );
    warnSpy.mockRestore();
  });
});

describe("CatchmentRoutingService polygon geometry (mocked GeoJSON)", () => {
  afterEach(() => {
    vi.doUnmock("node:fs");
    vi.doUnmock("./polyclinic-routing");
    vi.resetModules();
  });

  // Outer ring: a 2x2 square centred on the origin. Hole: a 1x1 square cut
  // out of its centre. GeoJSON coordinates are [lng, lat]; the service's
  // input string is "lat,lng".
  const outerRing = [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const holeRing = [
    [-0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ];

  async function mockGeojsonFeature(feature: {
    properties: { name: string };
    geometry: { type: string; coordinates: unknown };
  }) {
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        readFileSync: vi.fn(() => JSON.stringify({ features: [feature] })),
      };
    });
    vi.resetModules();
  }

  it("excludes points inside a polygon's hole but resolves points inside the outer ring", async () => {
    await mockGeojsonFeature({
      properties: { name: "Test Catchment With Hole" },
      geometry: { type: "Polygon", coordinates: [outerRing, holeRing] },
    });
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM: {
        "test-form": { "Test Catchment With Hole": "TEST-HOLE-CODE" },
      },
      PARISH_DEFAULTS: {},
      POLYCLINIC_EMAILS: {},
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    svc.onModuleInit();

    // lat=0, lng=0 — inside the hole, so no catchment (and no parish given).
    expect(svc.resolve({ formId: "test-form", coordinates: "0,0" })).toBeNull();

    // lat=0, lng=0.9 — inside the outer ring, outside the hole.
    const hit = svc.resolve({ formId: "test-form", coordinates: "0,0.9" });
    expect(hit?.polyclinic).toBe("Test Catchment With Hole");
    expect(hit?.programmeCode).toBe("TEST-HOLE-CODE");
  });

  it("throws on boot for an unsupported geometry type", async () => {
    await mockGeojsonFeature({
      properties: { name: "Test Point Catchment" },
      geometry: { type: "Point", coordinates: [0, 0] },
    });
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM: {
        "test-form": { "Test Point Catchment": "TEST-POINT-CODE" },
      },
      PARISH_DEFAULTS: {},
      POLYCLINIC_EMAILS: {},
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(
      /unsupported geometry type "Point"/,
    );
  });

  it("treats a Polygon with no rings as never matching", async () => {
    await mockGeojsonFeature({
      properties: { name: "Test Empty Catchment" },
      geometry: { type: "Polygon", coordinates: [] },
    });
    vi.doMock("./polyclinic-routing", () => ({
      PROGRAMME_CODES_BY_FORM: {
        "test-form": { "Test Empty Catchment": "TEST-EMPTY-CODE" },
      },
      PARISH_DEFAULTS: {},
      POLYCLINIC_EMAILS: {},
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    svc.onModuleInit();

    expect(svc.resolve({ formId: "test-form", coordinates: "0,0" })).toBeNull();
  });
});
