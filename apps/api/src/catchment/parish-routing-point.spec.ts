import { CatchmentRoutingService } from "./catchment-routing.service";
import { PARISH_DEFAULTS } from "./polyclinic-routing";
import {
  PARISH_ROUTING_POINTS,
  fillParishRoutingCoordinate,
  isRoutingCoordinate,
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

  // The coordinate field is `ui.hidden` and only ever written by an address
  // lookup, so a value that is not a "lat,lng" pair is not an answer worth
  // keeping — it is unusable to the point-in-polygon and would otherwise BLOCK
  // the parish fill, sending the CMS junk and resolving no polyclinic.
  it.each(["not-a-coordinate", "13.1132", "13.1132,", "abc,def", "13,-59"])(
    "replaces the malformed coordinate %j from the parish",
    (malformed) => {
      const values = {
        "event-details": {
          "event-parish": "st-philip",
          "event-address-coordinates": malformed,
        },
      };

      const out = fillParishRoutingCoordinate(values, routing);

      expect(
        (out["event-details"] as Record<string, unknown>)[
          "event-address-coordinates"
        ],
      ).toBe(PARISH_ROUTING_POINTS["st-philip"]);
    },
  );

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

describe("isRoutingCoordinate", () => {
  it.each(["13.1132,-59.5988", "-13.1132,-59.5988", "13.097442,-59.575067"])(
    "accepts the %j pair the geocoder and the parish table both write",
    (value) => {
      expect(isRoutingCoordinate(value)).toBe(true);
    },
  );

  it.each(["", "   ", "13.1132", "13,-59", "abc,def", "13.1,-59.6,7"])(
    "rejects %j",
    (value) => {
      expect(isRoutingCoordinate(value)).toBe(false);
    },
  );

  it("rejects a non-string", () => {
    expect(isRoutingCoordinate(undefined)).toBe(false);
    expect(isRoutingCoordinate(null)).toBe(false);
    expect(isRoutingCoordinate(13.1)).toBe(false);
  });

  it("accepts every point in the parish table", () => {
    for (const point of Object.values(PARISH_ROUTING_POINTS)) {
      expect(isRoutingCoordinate(point)).toBe(true);
    }
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
