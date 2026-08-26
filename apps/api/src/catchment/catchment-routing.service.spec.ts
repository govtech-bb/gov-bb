import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, beforeAll, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";
import {
  CATCHMENT_SUFFIX,
  PARISH_DEFAULTS,
  SERVING_CATCHMENT,
} from "./polyclinic-routing";

const LICENCE_FORM = "apply-for-temporary-restaurant-licence";
const LICENCE_CODE = "TEMP_RESTAURANT_LICENCE";
const OFFICER_FORM = "request-an-environmental-health-officer";
const OFFICER_CODE = "ENV_HEALTH_OFFICER";

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
      programmeCode: LICENCE_CODE,
      coordinates: "13.0901,-59.5861",
    });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
    expect(r?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT");
  });

  it("resolves a coordinate inside the MultiPolygon (Maurice Byer) catchment", () => {
    // Centroid of the larger Maurice Byer outer ring (the second polygon in
    // the MultiPolygon), confirmed in-polygon via a throwaway script.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "13.2716,-59.6044",
    });
    expect(r?.polyclinic).toBe("Maurice Byer Polyclinic");
  });

  it("falls back to parish when coordinates are absent", () => {
    const r = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      parish: "christ-church",
    });
    expect(r?.polyclinic).toBe("Randal Phillips Polyclinic");
  });

  it("falls back to parish when coordinates land outside every catchment (sea)", () => {
    const r = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "13.5,-60.5",
      parish: "st-michael",
    });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
  });

  it("treats a lon,lat mix-up as offshore and uses the parish", () => {
    // Correct order for the WSS point is 13.0901,-59.5861; reversed lands in the sea.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "-59.5861,13.0901",
      parish: "st-thomas",
    });
    expect(r?.polyclinic).toBe("Eunice Gibson Polyclinic");
  });

  it("returns null when neither coordinates nor a known parish resolve", () => {
    expect(
      svc.resolve({ formId: LICENCE_FORM, programmeCode: LICENCE_CODE }),
    ).toBeNull();
    expect(
      svc.resolve({
        formId: LICENCE_FORM,
        programmeCode: LICENCE_CODE,
        parish: "not-a-parish",
      }),
    ).toBeNull();
  });

  it("names St. Philip, not Frederick Miller, for a coordinate in the Frederick Miller catchment", () => {
    // Centroid of the Frederick Miller outer ring, confirmed in-polygon via a
    // throwaway script. Frederick Miller has no Environmental Health
    // Department of its own, so the whole resolution — the name the
    // confirmation page and email show, the code, and the inbox — is
    // St. Philip's.
    const r = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "13.1323,-59.5626",
    });
    expect(r?.polyclinic).toBe("St. Philip Polyclinic");
    expect(r?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_ST_PHILIP");
  });

  it("falls back to parish when the coordinate string is malformed (wrong part count)", () => {
    expect(
      svc.resolve({
        formId: LICENCE_FORM,
        programmeCode: LICENCE_CODE,
        coordinates: "13.1",
        parish: "st-michael",
      })?.polyclinic,
    ).toBe("Sir Winston Scott Polyclinic");
    expect(
      svc.resolve({
        formId: LICENCE_FORM,
        programmeCode: LICENCE_CODE,
        coordinates: "1,2,3",
        parish: "st-michael",
      })?.polyclinic,
    ).toBe("Sir Winston Scott Polyclinic");
  });

  it("falls back to parish when the coordinate string is non-numeric", () => {
    const r = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "north,west",
      parish: "st-thomas",
    });
    expect(r?.polyclinic).toBe("Eunice Gibson Polyclinic");
  });

  it("resolves the officer-request formId to its matching ENV_HEALTH_OFFICER_* code for the same coordinate (regression: licence routing unchanged, per-form codes differ)", () => {
    const licence = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "13.0901,-59.5861",
    });
    const officer = svc.resolve({
      formId: OFFICER_FORM,
      programmeCode: OFFICER_CODE,
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
      programmeCode: OFFICER_CODE,
      coordinates: "13.1323,-59.5626",
    });
    expect(officer?.polyclinic).toBe("St. Philip Polyclinic");
    expect(officer?.programmeCode).toBe("ENV_HEALTH_OFFICER_ST_PHILIP");

    const licence = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      coordinates: "13.1323,-59.5626",
    });
    expect(licence?.polyclinic).toBe("St. Philip Polyclinic");
    expect(licence?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_ST_PHILIP");

    // The parish fallback for st-philip lands on the same resolution, so a
    // geocode outage and a coordinate hit cannot name different polyclinics.
    const byParish = svc.resolve({
      formId: LICENCE_FORM,
      programmeCode: LICENCE_CODE,
      parish: "st-philip",
    });
    expect(byParish).toEqual(licence);
  });

  it("returns null and logs an error when the recipe supplies no programme code", () => {
    // A recipe with `catchmentRouting` but no mapped webhook. The loader
    // refuses such a recipe at boot, so this is the guard behind that.
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

  it("composes a code for an unlisted form from its own programme code — a new catchment-routed form costs nothing here", () => {
    const r = svc.resolve({
      formId: "some-future-form",
      programmeCode: "FUTURE_THING",
      coordinates: "13.0901,-59.5861",
    });
    expect(r?.programmeCode).toBe("FUTURE_THING_WINSTON_SCOTT");
  });
});

// The refactor's non-negotiable guard (#2329): every programme code the
// 28-entry `PROGRAMME_CODES_BY_FORM` table used to hold, byte-identical, now
// produced by composing each recipe's own webhook `mapping.programmeCode` with
// the shared catchment suffix. These route real cases to real CMS queues — a
// diff here is a misrouted submission, not a failing test.
//
// The recipe programme codes are read from the real recipe files rather than
// restated, so editing a recipe's `mapping.programmeCode` without a
// corresponding CMS rename fails here too.
describe("programme codes are unchanged by composition (golden)", () => {
  const RECIPES_ROOT = path.resolve(
    __dirname,
    "../forms/form-definitions/recipes",
  );

  // One coordinate inside each serving catchment and inside no other,
  // confirmed against the GeoJSON via a throwaway script. Branford Taitt has
  // no parish default, so a coordinate is the only way to reach it.
  const POINT_IN: Record<string, string> = {
    "Branford Taitt Polyclinic": "13.1377,-59.6259",
    "David Thompson Health & Social Services Complex": "13.1855,-59.5038",
    "Eunice Gibson Polyclinic": "13.1781,-59.5924",
    "Maurice Byer Polyclinic": "13.2716,-59.6044",
    "Randal Phillips Polyclinic": "13.0658,-59.5282",
    "Sir Winston Scott Polyclinic": "13.0901,-59.5861",
    "St. Philip Polyclinic": "13.1478,-59.4424",
  };

  const EXPECTED: Record<string, Record<string, string>> = {
    "apply-for-temporary-restaurant-licence": {
      "Branford Taitt Polyclinic": "TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "TEMP_RESTAURANT_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "TEMP_RESTAURANT_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "TEMP_RESTAURANT_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "TEMP_RESTAURANT_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "TEMP_RESTAURANT_LICENCE_ST_PHILIP",
    },
    "apply-for-restaurant-licence": {
      "Branford Taitt Polyclinic": "RESTAURANT_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "RESTAURANT_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "RESTAURANT_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "RESTAURANT_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "RESTAURANT_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "RESTAURANT_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "RESTAURANT_LICENCE_ST_PHILIP",
    },
    "request-an-environmental-health-officer": {
      "Branford Taitt Polyclinic": "ENV_HEALTH_OFFICER_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "ENV_HEALTH_OFFICER_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "ENV_HEALTH_OFFICER_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "ENV_HEALTH_OFFICER_MAURICE_BYER",
      "Randal Phillips Polyclinic": "ENV_HEALTH_OFFICER_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "ENV_HEALTH_OFFICER_WINSTON_SCOTT",
      "St. Philip Polyclinic": "ENV_HEALTH_OFFICER_ST_PHILIP",
    },
    "apply-for-food-business-licence": {
      "Branford Taitt Polyclinic": "FOOD_BUSINESS_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "FOOD_BUSINESS_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "FOOD_BUSINESS_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "FOOD_BUSINESS_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "FOOD_BUSINESS_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "FOOD_BUSINESS_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "FOOD_BUSINESS_LICENCE_ST_PHILIP",
    },
    "apply-for-hotel-licence": {
      "Branford Taitt Polyclinic": "HOTEL_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "HOTEL_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "HOTEL_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "HOTEL_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "HOTEL_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "HOTEL_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "HOTEL_LICENCE_ST_PHILIP",
    },
    "register-hair-beauty-business": {
      "Branford Taitt Polyclinic": "HAIR_BEAUTY_BUSINESS_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "HAIR_BEAUTY_BUSINESS_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "HAIR_BEAUTY_BUSINESS_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "HAIR_BEAUTY_BUSINESS_MAURICE_BYER",
      "Randal Phillips Polyclinic": "HAIR_BEAUTY_BUSINESS_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "HAIR_BEAUTY_BUSINESS_WINSTON_SCOTT",
      "St. Philip Polyclinic": "HAIR_BEAUTY_BUSINESS_ST_PHILIP",
    },
    "hairdresser-licence-application": {
      "Branford Taitt Polyclinic": "HAIRDRESSER_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "HAIRDRESSER_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "HAIRDRESSER_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "HAIRDRESSER_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "HAIRDRESSER_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "HAIRDRESSER_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "HAIRDRESSER_LICENCE_ST_PHILIP",
    },
    "apply-for-swimming-pool-licence": {
      "Branford Taitt Polyclinic": "SWIMMING_POOL_PERMIT_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "SWIMMING_POOL_PERMIT_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "SWIMMING_POOL_PERMIT_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "SWIMMING_POOL_PERMIT_MAURICE_BYER",
      "Randal Phillips Polyclinic": "SWIMMING_POOL_PERMIT_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "SWIMMING_POOL_PERMIT_WINSTON_SCOTT",
      "St. Philip Polyclinic": "SWIMMING_POOL_PERMIT_ST_PHILIP",
    },
    "register-guest-property-environmental-health": {
      "Branford Taitt Polyclinic": "GUEST_PROPERTY_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "GUEST_PROPERTY_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "GUEST_PROPERTY_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "GUEST_PROPERTY_MAURICE_BYER",
      "Randal Phillips Polyclinic": "GUEST_PROPERTY_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "GUEST_PROPERTY_WINSTON_SCOTT",
      "St. Philip Polyclinic": "GUEST_PROPERTY_ST_PHILIP",
    },
    "funeral-establishment-licence-application": {
      "Branford Taitt Polyclinic":
        "FUNERAL_ESTABLISHMENT_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "FUNERAL_ESTABLISHMENT_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "FUNERAL_ESTABLISHMENT_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "FUNERAL_ESTABLISHMENT_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic":
        "FUNERAL_ESTABLISHMENT_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic":
        "FUNERAL_ESTABLISHMENT_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "FUNERAL_ESTABLISHMENT_LICENCE_ST_PHILIP",
    },
    "funeral-directors-licence-application": {
      "Branford Taitt Polyclinic": "FUNERAL_DIRECTORS_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "FUNERAL_DIRECTORS_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "FUNERAL_DIRECTORS_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "FUNERAL_DIRECTORS_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "FUNERAL_DIRECTORS_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "FUNERAL_DIRECTORS_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "FUNERAL_DIRECTORS_LICENCE_ST_PHILIP",
    },
    "funeral-embalmer-licence-application": {
      "Branford Taitt Polyclinic": "EMBALMER_LICENCE_BRANFORD_TAITT",
      "David Thompson Health & Social Services Complex":
        "EMBALMER_LICENCE_DAVID_THOMPSON",
      "Eunice Gibson Polyclinic": "EMBALMER_LICENCE_EUNICE_GIBSON",
      "Maurice Byer Polyclinic": "EMBALMER_LICENCE_MAURICE_BYER",
      "Randal Phillips Polyclinic": "EMBALMER_LICENCE_RANDAL_PHILLIPS",
      "Sir Winston Scott Polyclinic": "EMBALMER_LICENCE_WINSTON_SCOTT",
      "St. Philip Polyclinic": "EMBALMER_LICENCE_ST_PHILIP",
    },
  };

  /** The recipe's own webhook `mapping.programmeCode`, read off the real file. */
  function recipeProgrammeCode(formId: string): string {
    const recipe = JSON.parse(
      fs.readFileSync(path.join(RECIPES_ROOT, `${formId}.json`), "utf8"),
    ) as {
      processors?: {
        type: string;
        config?: { mapping?: { programmeCode?: string } };
      }[];
    };
    const code = recipe.processors?.find((p) => p.type === "webhook")?.config
      ?.mapping?.programmeCode;
    if (!code)
      throw new Error(`${formId} has no webhook mapping.programmeCode`);
    return code;
  }

  const svc = new CatchmentRoutingService();
  svc.onModuleInit();

  for (const [formId, byCatchment] of Object.entries(EXPECTED)) {
    for (const [catchment, expected] of Object.entries(byCatchment)) {
      it(`${formId} / ${catchment} → ${expected}`, () => {
        const r = svc.resolve({
          formId,
          programmeCode: recipeProgrammeCode(formId),
          coordinates: POINT_IN[catchment],
        });
        expect(r?.polyclinic).toBe(catchment);
        expect(r?.programmeCode).toBe(expected);
      });
    }
  }

  it("every catchment-routed recipe is covered by the table above", () => {
    const routed = fs
      .readdirSync(RECIPES_ROOT)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => {
        const raw = JSON.parse(
          fs.readFileSync(path.join(RECIPES_ROOT, f), "utf8"),
        ) as { catchmentRouting?: unknown };
        return raw.catchmentRouting !== undefined;
      })
      .map((f) => f.replace(/\.json$/, ""));
    expect(routed.sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});

describe("CatchmentRoutingService boot validation (mocked data)", () => {
  afterEach(() => {
    vi.doUnmock("./polyclinic-routing");
    vi.resetModules();
  });

  it("throws when a GeoJSON serving catchment has no suffix", async () => {
    const { "Sir Winston Scott Polyclinic": _omit, ...rest } = CATCHMENT_SUFFIX;
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX: rest,
      PARISH_DEFAULTS,
      SERVING_CATCHMENT,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Sir Winston Scott Polyclinic/);
  });

  it("throws when CATCHMENT_SUFFIX has a key that is not a GeoJSON catchment name", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX: {
        ...CATCHMENT_SUFFIX,
        "Not A Real Polyclinic": "BOGUS",
      },
      PARISH_DEFAULTS,
      SERVING_CATCHMENT,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Not A Real Polyclinic/);
  });

  it("throws when CATCHMENT_SUFFIX keeps a suffix for a redirected catchment", async () => {
    // Regression guard for the bug this redirect fixed: a leftover
    // Frederick Miller key is a code nothing can reach, and its existence is
    // what let the name and the routing drift apart.
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX: {
        ...CATCHMENT_SUFFIX,
        "Frederick Miller Polyclinic": "FREDERICK_MILLER",
      },
      PARISH_DEFAULTS,
      SERVING_CATCHMENT,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Frederick Miller Polyclinic/);
  });

  it("throws when a PARISH_DEFAULTS value names an unknown catchment", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX,
      PARISH_DEFAULTS: {
        ...PARISH_DEFAULTS,
        "st-lucy": "Not A Real Polyclinic",
      },
      SERVING_CATCHMENT,
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/PARISH_DEFAULTS/);
  });

  it("throws when SERVING_CATCHMENT redirects a catchment that is not in the GeoJSON", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX,
      PARISH_DEFAULTS,
      SERVING_CATCHMENT: {
        ...SERVING_CATCHMENT,
        "Not A Real Polyclinic": "St. Philip Polyclinic",
      },
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Not A Real Polyclinic/);
  });

  it("throws when SERVING_CATCHMENT points at a catchment that is not in the GeoJSON", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX,
      PARISH_DEFAULTS,
      SERVING_CATCHMENT: {
        "Frederick Miller Polyclinic": "Not A Real Polyclinic",
      },
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/Not A Real Polyclinic/);
  });

  it("throws when a SERVING_CATCHMENT target is itself redirected (chain)", async () => {
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX,
      PARISH_DEFAULTS,
      SERVING_CATCHMENT: {
        "Frederick Miller Polyclinic": "St. Philip Polyclinic",
        "St. Philip Polyclinic": "Randal Phillips Polyclinic",
      },
    }));
    vi.resetModules();
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    expect(() => svc.onModuleInit()).toThrow(/chains are not followed/);
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

  function mockRouting(catchment: string, suffix: string) {
    vi.doMock("./polyclinic-routing", () => ({
      CATCHMENT_SUFFIX: { [catchment]: suffix },
      PARISH_DEFAULTS: {},
      SERVING_CATCHMENT: {},
    }));
    vi.resetModules();
  }

  it("excludes points inside a polygon's hole but resolves points inside the outer ring", async () => {
    await mockGeojsonFeature({
      properties: { name: "Test Catchment With Hole" },
      geometry: { type: "Polygon", coordinates: [outerRing, holeRing] },
    });
    mockRouting("Test Catchment With Hole", "HOLE");
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    svc.onModuleInit();

    // lat=0, lng=0 — inside the hole, so no catchment (and no parish given).
    expect(
      svc.resolve({
        formId: "test-form",
        programmeCode: "TEST",
        coordinates: "0,0",
      }),
    ).toBeNull();

    // lat=0, lng=0.9 — inside the outer ring, outside the hole.
    const hit = svc.resolve({
      formId: "test-form",
      programmeCode: "TEST",
      coordinates: "0,0.9",
    });
    expect(hit?.polyclinic).toBe("Test Catchment With Hole");
    expect(hit?.programmeCode).toBe("TEST_HOLE");
  });

  it("throws on boot for an unsupported geometry type", async () => {
    await mockGeojsonFeature({
      properties: { name: "Test Point Catchment" },
      geometry: { type: "Point", coordinates: [0, 0] },
    });
    mockRouting("Test Point Catchment", "POINT");
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
    mockRouting("Test Empty Catchment", "EMPTY");
    const { CatchmentRoutingService: Svc } =
      await import("./catchment-routing.service");
    const svc = new Svc();
    svc.onModuleInit();

    expect(
      svc.resolve({
        formId: "test-form",
        programmeCode: "TEST",
        coordinates: "0,0",
      }),
    ).toBeNull();
  });
});
