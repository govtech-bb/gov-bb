import {
  configureJourney,
  flushJourney,
  MAX_EVENT_NAME_LENGTH,
  trackEvent,
  type ToolId,
  type TrackingData,
} from "./index";
import { MAX_PROPS, PROP_KEY, resetJourneyForTests } from "./journey";
import type { Mock } from "vitest";

type Track = NonNullable<Window["umami"]>["track"];
type ToolEventName =
  | "tool-step-view"
  | "tool-result"
  | "tool-action"
  | "tool-error";
type ResultFor<T extends ToolId> = Extract<
  TrackingData["tool-result"],
  { tool: T }
>;

// Every prop key each tool event allows, required or optional. The types make
// this list exact: a key missing here, or one the event does not allow, fails
// type-check, and so does a tool missing from tool-result.
const ALLOWED_KEYS: {
  "tool-step-view": Record<keyof TrackingData["tool-step-view"], true>;
  "tool-action": Record<keyof TrackingData["tool-action"], true>;
  "tool-error": Record<keyof TrackingData["tool-error"], true>;
  "tool-result": { [T in ToolId]: Record<keyof ResultFor<T>, true> };
} = {
  "tool-step-view": { tool: true, step: true },
  "tool-action": { tool: true, action: true, target: true, step: true },
  "tool-error": { tool: true, error: true, step: true },
  "tool-result": {
    "pharmacy-finder": {
      tool: true,
      outcome: true,
      results: true,
      parishes: true,
      type: true,
      slip: true,
      subsidised_only: true,
      open_now: true,
      has_query: true,
      used_location: true,
    },
    "shelter-finder": {
      tool: true,
      outcome: true,
      results: true,
      parishes: true,
      categories: true,
      amenities: true,
      sort: true,
      has_query: true,
      used_location: true,
    },
    "water-outages": {
      tool: true,
      outcome: true,
      results: true,
      step: true,
      parish: true,
      chosen_by: true,
      active_notices: true,
      past_notices: true,
    },
    "crop-over-permits": {
      tool: true,
      outcome: true,
      results: true,
      event: true,
      venue: true,
      permits: true,
    },
    "severance-calculator": {
      tool: true,
      outcome: true,
      results: true,
      reason: true,
    },
    "nis-self-employed": {
      tool: true,
      outcome: true,
      results: true,
      plan: true,
    },
    "pension-calculator": { tool: true, outcome: true, results: true },
    "bank-holidays": { tool: true, outcome: true, results: true },
  },
};

const KEY_SETS: [string, string[]][] = [
  ...(["tool-step-view", "tool-action", "tool-error"] as const).map(
    (e): [string, string[]] => [e, Object.keys(ALLOWED_KEYS[e])],
  ),
  ...Object.entries(ALLOWED_KEYS["tool-result"]).map(
    ([tool, keys]): [string, string[]] => [
      `tool-result (${tool})`,
      Object.keys(keys),
    ],
  ),
];

// One full event of each kind, with every prop a tool may send.
const EVENTS: { [E in ToolEventName]: [E, TrackingData[E]] } = {
  "tool-step-view": [
    "tool-step-view",
    { tool: "severance-calculator", step: "q-years" },
  ],
  "tool-result": [
    "tool-result",
    {
      tool: "pharmacy-finder",
      outcome: "results",
      results: 4,
      parishes: "st-michael,christ-church",
      type: "retail",
      slip: "green",
      subsidised_only: true,
      open_now: false,
      has_query: true,
      used_location: false,
    },
  ],
  "tool-action": [
    "tool-action",
    {
      tool: "shelter-finder",
      action: "call",
      target: "shelter-12",
      step: "find",
    },
  ],
  "tool-error": [
    "tool-error",
    { tool: "water-outages", error: "location-denied", step: "find" },
  ],
};

describe("tool events (ADR 0079)", () => {
  let beacon: Mock;
  let track: Mock<Track>;

  beforeEach(() => {
    beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
      writable: true,
    });
    track = vi.fn<Track>();
    window.umami = { track };
    configureJourney({ url: "https://api.example/journey", app: "landing" });
  });

  afterEach(() => {
    resetJourneyForTests();
    delete (window as { umami?: unknown }).umami;
  });

  it.each(Object.values(EVENTS))(
    "sends %s to Umami and /journey under its own name, unpacked",
    (event, data) => {
      trackEvent(event, data);
      flushJourney();

      const umamiCall = track.mock.calls[0][0];
      if (typeof umamiCall !== "function") throw new Error("not a function");
      expect(umamiCall({})).toMatchObject({ name: event, data });
      expect(event.length).toBeLessThanOrEqual(MAX_EVENT_NAME_LENGTH);

      const queued = JSON.parse(beacon.mock.calls[0][1] as string);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ event, props: data });
    },
  );

  it("covers all 8 tools", () => {
    expect(Object.keys(ALLOWED_KEYS["tool-result"])).toHaveLength(8);
  });

  it.each(KEY_SETS)("%s keys pass the /journey key rule", (_, keys) => {
    for (const key of keys) expect(key).toMatch(PROP_KEY);
  });

  it.each(KEY_SETS)("%s never needs more than 20 props", (_, keys) => {
    expect(keys.length).toBeLessThanOrEqual(MAX_PROPS);
  });

  it("rejects an unknown tool or a prop the event does not allow", () => {
    // Never called: these lines exist for type-check, which fails if any of
    // them stops being an error.
    const typeChecks = () => {
      // @ts-expect-error -- not a tool
      trackEvent("tool-step-view", { tool: "loan-calculator", step: "q-pay" });
      // @ts-expect-error -- an amount is never sent
      trackEvent("tool-result", {
        tool: "pension-calculator",
        outcome: "estimated",
        amount: 1200,
      });
      // @ts-expect-error -- a pharmacy-finder prop on another tool
      trackEvent("tool-result", {
        tool: "shelter-finder",
        outcome: "results",
        open_now: true,
      });
      // @ts-expect-error -- outcome is required
      trackEvent("tool-result", { tool: "pension-calculator" });
      // @ts-expect-error -- a step view needs its step
      trackEvent("tool-step-view", { tool: "pension-calculator" });
    };
    expect(typeChecks).toBeTypeOf("function");
  });
});
