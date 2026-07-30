import {
  PARISH_ROUTING_POINTS,
  fillParishRoutingCoordinate,
} from "./parish-routing-points";
import type { CatchmentRouting } from "@govtech-bb/form-types";
import type { FormValuesByStep } from "@forms/types";

const routing: CatchmentRouting = {
  coordinatesField: "event-details.event-address-coordinates",
  parishField: "event-details.event-parish",
};

describe("fillParishRoutingCoordinate", () => {
  it("fills the coordinate from the parish routing point when the coordinate is empty", () => {
    const data: FormValuesByStep = {
      "event-details": { "event-parish": "st-michael" },
    };
    const out = fillParishRoutingCoordinate(data, routing);
    expect(
      (out["event-details"] as Record<string, unknown>)[
        "event-address-coordinates"
      ],
    ).toBe(PARISH_ROUTING_POINTS["st-michael"]);
  });

  it("leaves a real geocoded coordinate untouched", () => {
    const data: FormValuesByStep = {
      "event-details": {
        "event-parish": "st-michael",
        "event-address-coordinates": "13.271600,-59.604400",
      },
    };
    const out = fillParishRoutingCoordinate(data, routing);
    expect(
      (out["event-details"] as Record<string, unknown>)[
        "event-address-coordinates"
      ],
    ).toBe("13.271600,-59.604400");
  });

  it("returns the data unchanged when the recipe declares no catchment routing", () => {
    const data: FormValuesByStep = {
      "event-details": { "event-parish": "st-michael" },
    };
    expect(fillParishRoutingCoordinate(data, undefined)).toBe(data);
  });

  it("returns the data unchanged when the parish is missing or unrecognised", () => {
    const missing: FormValuesByStep = { "event-details": {} };
    expect(fillParishRoutingCoordinate(missing, routing)).toEqual(missing);

    const unknown: FormValuesByStep = {
      "event-details": { "event-parish": "atlantis" },
    };
    expect(fillParishRoutingCoordinate(unknown, routing)).toEqual(unknown);
  });

  it("does not mutate the input object", () => {
    const data: FormValuesByStep = {
      "event-details": { "event-parish": "st-peter" },
    };
    const snapshot = JSON.parse(JSON.stringify(data));
    fillParishRoutingCoordinate(data, routing);
    expect(data).toEqual(snapshot);
  });

  it("has a routing point for every parish the API can route on", () => {
    // Keep in lockstep with PARISH_DEFAULTS (apps/api catchment routing).
    const parishes = [
      "st-lucy",
      "st-peter",
      "st-andrew",
      "st-james",
      "st-thomas",
      "st-joseph",
      "st-john",
      "st-george",
      "st-philip",
      "christ-church",
      "st-michael",
    ];
    for (const p of parishes) {
      expect(PARISH_ROUTING_POINTS[p]).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
    }
  });
});
