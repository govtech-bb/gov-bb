import { CatchmentRoutingService } from "./catchment-routing.service";
import { PARISH_DEFAULTS } from "./polyclinic-routing";
import {
  PARISH_ROUTING_POINTS,
  fillParishRoutingCoordinate,
} from "./parish-routing-point";

const routing = {
  coordinatesField: "event-details.event-address-coordinates",
  parishField: "event-details.event-parish",
};

describe("fillParishRoutingCoordinate", () => {
  it("fills the coordinate from the parish routing point when the coordinate is empty", () => {
    const values = { "event-details": { "event-parish": "st-michael" } };

    const out = fillParishRoutingCoordinate(values, routing);

    expect(
      (out["event-details"] as Record<string, unknown>)[
        "event-address-coordinates"
      ],
    ).toBe(PARISH_ROUTING_POINTS["st-michael"]);
  });

  it("leaves a real geocoded coordinate untouched", () => {
    const values = {
      "event-details": {
        "event-parish": "st-michael",
        "event-address-coordinates": "13.1132,-59.5988",
      },
    };

    const out = fillParishRoutingCoordinate(values, routing);

    expect(
      (out["event-details"] as Record<string, unknown>)[
        "event-address-coordinates"
      ],
    ).toBe("13.1132,-59.5988");
  });

  it("treats a blank coordinate as absent", () => {
    const values = {
      "event-details": {
        "event-parish": "st-philip",
        "event-address-coordinates": "   ",
      },
    };

    const out = fillParishRoutingCoordinate(values, routing);

    expect(
      (out["event-details"] as Record<string, unknown>)[
        "event-address-coordinates"
      ],
    ).toBe(PARISH_ROUTING_POINTS["st-philip"]);
  });

  it("returns the values unchanged when the parish is missing or unrecognised", () => {
    const missing = { "event-details": {} };
    const unknown = { "event-details": { "event-parish": "atlantis" } };

    expect(fillParishRoutingCoordinate(missing, routing)).toEqual(missing);
    expect(fillParishRoutingCoordinate(unknown, routing)).toEqual(unknown);
  });

  it("does not mutate the input", () => {
    const values = { "event-details": { "event-parish": "st-michael" } };

    fillParishRoutingCoordinate(values, routing);

    expect(values["event-details"]).toEqual({ "event-parish": "st-michael" });
  });

  // The point has to sit inside the catchment the parish is assigned to, or the
  // filled coordinate and the parish fallback would name different polyclinics.
  it("has a routing point for every parish the API can route on", () => {
    for (const parish of Object.keys(PARISH_DEFAULTS)) {
      expect(PARISH_ROUTING_POINTS[parish]).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
    }
    expect(Object.keys(PARISH_ROUTING_POINTS).sort()).toEqual(
      Object.keys(PARISH_DEFAULTS).sort(),
    );
  });
});

// The whole point of the table: a filled coordinate must resolve to exactly the
// polyclinic the parish fallback would have chosen, or the CMS programme code
// and the {polyclinic} name on the confirmation page can disagree.
describe("PARISH_ROUTING_POINTS resolve to their assigned catchment", () => {
  let svc: CatchmentRoutingService;
  beforeAll(() => {
    svc = new CatchmentRoutingService();
    svc.onModuleInit();
  });

  it.each(Object.keys(PARISH_DEFAULTS))(
    "%s routing point lands in the catchment the parish maps to",
    (parish) => {
      const r = svc.resolve({
        formId: "apply-for-temporary-restaurant-permit",
        programmeCode: "TEMP_RESTAURANT_PERMIT",
        coordinates: PARISH_ROUTING_POINTS[parish],
      });
      expect(r?.polyclinic).toBe(PARISH_DEFAULTS[parish]);
    },
  );
});
