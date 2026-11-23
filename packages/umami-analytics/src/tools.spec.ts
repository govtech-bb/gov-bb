import { describe, expect, it } from "vitest";
import {
  liveTools,
  shapeToolEvents,
  shapeTools,
  shapeWaterAlerts,
  type Tool,
  type ToolEventRows,
} from "./tools";

describe("liveTools", () => {
  it("lists every tool once, by the ID its events carry", () => {
    expect(
      liveTools()
        .map((t) => t.id)
        .sort(),
    ).toEqual([
      "bank-holidays",
      "crop-over-permits",
      "nis-self-employed",
      "pension-calculator",
      "pharmacy-finder",
      "severance-calculator",
      "shelter-finder",
      "water-outages",
    ]);
  });
});

describe("shapeTools (per-tool rollup)", () => {
  const shelter: Tool = {
    id: "shelter-finder",
    name: "Find an emergency shelter",
    prefix: "/health-and-emergency-services/find-an-emergency-shelter",
    primaryPath: "/health-and-emergency-services/find-an-emergency-shelter",
    live: true,
  };
  const bankHoliday: Tool = {
    id: "bank-holidays",
    name: "Check bank holiday dates",
    prefix: "/bank-holiday-calendar",
    primaryPath: "/bank-holiday-calendar",
    live: true,
  };
  const noEvents: ToolEventRows = {
    resultsByTool: [],
    actionsByTool: [],
    errorsByTool: [],
    outcomes: new Map(),
    actions: new Map(),
  };

  it("rolls up all URL rows under a tool prefix (pageviews + visitors summed)", () => {
    const rows = [
      { x: shelter.prefix, pageviews: 100, visitors: 80 },
      { x: `${shelter.prefix}/find`, pageviews: 40, visitors: 30 },
      { x: `${shelter.prefix}/guidance`, pageviews: 10, visitors: 8 },
    ];
    const sources = new Map([
      [shelter.primaryPath, [{ referrer: "google", count: 12 }]],
    ]);
    const [row] = shapeTools([shelter], rows, sources, noEvents);
    expect(row).toEqual({
      name: shelter.name,
      path: shelter.primaryPath,
      pageviews: 150,
      visitors: 118,
      topSources: [{ referrer: "google", count: 12 }],
      events: null,
    });
  });

  it("does not swallow a same-stemmed sibling path (prefix boundary)", () => {
    const rows = [
      { x: bankHoliday.prefix, pageviews: 50, visitors: 40 },
      { x: "/bank-holiday-calendar-archive", pageviews: 999, visitors: 999 },
    ];
    const [row] = shapeTools([bankHoliday], rows, new Map(), noEvents);
    expect(row.pageviews).toBe(50);
    expect(row.visitors).toBe(40);
  });

  it("lists a tool with no traffic at zero, with no sources", () => {
    const [row] = shapeTools([bankHoliday], [], new Map(), noEvents);
    expect(row).toEqual({
      name: bankHoliday.name,
      path: bankHoliday.primaryPath,
      pageviews: 0,
      visitors: 0,
      topSources: [],
      events: null,
    });
  });

  it("reads path from x or name and pageviews from pageviews or y", () => {
    const rows = [
      { name: bankHoliday.prefix, y: 7 }, // name + y fallbacks, no visitors
    ];
    const [row] = shapeTools([bankHoliday], rows, new Map(), noEvents);
    expect(row.pageviews).toBe(7);
    expect(row.visitors).toBe(0);
  });

  it("attaches each tool's own event metrics to its row", () => {
    const [row] = shapeTools([shelter], [], new Map(), {
      ...noEvents,
      resultsByTool: [{ value: "shelter-finder", total: 4 }],
    });
    expect(row.events?.results).toBe(4);
  });

  it("returns one row per tool, in the given order", () => {
    const rows = shapeTools([shelter, bankHoliday], [], new Map(), noEvents);
    expect(rows.map((r) => r.name)).toEqual([shelter.name, bankHoliday.name]);
  });
});

describe("shapeToolEvents (a tool's own events, ADR 0138)", () => {
  const pharmacy: Tool = {
    id: "pharmacy-finder",
    name: "Find an open pharmacy",
    prefix: "/health-and-emergency-services/find-an-open-pharmacy",
    primaryPath: "/health-and-emergency-services/find-an-open-pharmacy",
    noResultOutcome: "no-results",
    live: true,
  };
  const pension: Tool = {
    id: "pension-calculator",
    name: "Calculate your Government pension",
    prefix: "/pensions-and-gratuities/calculate-your-pension",
    primaryPath: "/pensions-and-gratuities/calculate-your-pension",
    live: true,
  };
  // Every tool's totals come from the `tool` values; the outcome and action
  // breakdowns are per tool (fetched with Umami's property filter).
  const rows: ToolEventRows = {
    resultsByTool: [
      { value: "pharmacy-finder", total: 40 },
      { value: "pension-calculator", total: 9 },
    ],
    actionsByTool: [{ value: "pharmacy-finder", total: 15 }],
    errorsByTool: [{ value: "pharmacy-finder", total: 10 }],
    outcomes: new Map([
      [
        "pharmacy-finder",
        [
          { value: "results", total: 30 },
          { value: "no-results", total: 10 },
        ],
      ],
      ["pension-calculator", [{ value: "estimated", total: 9 }]],
    ]),
    actions: new Map([
      [
        "pharmacy-finder",
        [
          { value: "directions", total: 4 },
          { value: "call", total: 11 },
        ],
      ],
    ]),
  };

  it("gives results, no-result rate, top action and error rate", () => {
    expect(shapeToolEvents(pharmacy, rows)).toEqual({
      results: 40,
      noResultRate: 0.25, // 10 of 40 results were no-results
      topAction: { action: "call", count: 11 },
      errors: 10,
      errorRate: 0.2, // 10 ÷ (40 results + 10 errors)
    });
  });

  it("has no events (null) for a tool that sent none — the empty state", () => {
    const bankHolidays: Tool = {
      id: "bank-holidays",
      name: "Check bank holiday dates",
      prefix: "/bank-holiday-calendar",
      primaryPath: "/bank-holiday-calendar",
      live: true,
    };
    expect(shapeToolEvents(bankHolidays, rows)).toBeNull();
  });

  it("has no no-result rate for a tool without a no-result outcome", () => {
    const stats = shapeToolEvents(pension, rows);
    expect(stats?.results).toBe(9);
    expect(stats?.noResultRate).toBeNull();
    expect(stats?.topAction).toBeNull();
    expect(stats?.errorRate).toBe(0);
  });

  it("counts errors even when a tool has no results yet", () => {
    const stats = shapeToolEvents(pharmacy, {
      ...rows,
      resultsByTool: [],
      outcomes: new Map(),
    });
    expect(stats).toMatchObject({
      results: 0,
      noResultRate: null,
      errors: 10,
      errorRate: 1,
    });
  });

  it("shows no breakdown when its query failed (no rows for the tool)", () => {
    const stats = shapeToolEvents(pharmacy, {
      ...rows,
      outcomes: new Map(),
      actions: new Map(),
    });
    expect(stats).toMatchObject({ results: 40, errors: 10, errorRate: 0.2 });
    expect(stats?.noResultRate).toBeNull();
    expect(stats?.topAction).toBeNull();
  });

  it("shows no breakdown that adds up to more than the tool's own count", () => {
    // What Umami would return if it ignored the `tool` filter: every tool's
    // outcomes and actions, not just the pharmacy finder's.
    const stats = shapeToolEvents(pharmacy, {
      ...rows,
      outcomes: new Map([
        [
          "pharmacy-finder",
          [
            { value: "results", total: 30 },
            { value: "no-results", total: 10 },
            { value: "estimated", total: 9 },
          ],
        ],
      ]),
      actions: new Map([
        [
          "pharmacy-finder",
          [
            { value: "call", total: 11 },
            { value: "restart", total: 20 },
          ],
        ],
      ]),
    });
    expect(stats?.results).toBe(40);
    expect(stats?.noResultRate).toBeNull();
    expect(stats?.topAction).toBeNull();
  });

  it("has no error rate when a tool sent only actions", () => {
    const stats = shapeToolEvents(pharmacy, {
      ...rows,
      resultsByTool: [],
      errorsByTool: [],
      outcomes: new Map(),
    });
    expect(stats).toMatchObject({ results: 0, errors: 0, errorRate: null });
    expect(stats?.topAction).toEqual({ action: "call", count: 11 });
  });
});

describe("shapeWaterAlerts (water outage alert sign-up funnel)", () => {
  const outcomes = [
    { value: "parish-chosen", total: 120 },
    { value: "subscribe-sent", total: 18 },
    { value: "subscribe-failed", total: 2 },
    { value: "confirmed", total: 12 },
    { value: "invalid-token", total: 1 },
    { value: "unsubscribed", total: 3 },
  ];
  const actions = [
    { value: "subscribe-submit", total: 20 },
    { value: "open-notice", total: 40 },
  ];
  const rows: ToolEventRows = {
    resultsByTool: [{ value: "water-outages", total: 156 }],
    actionsByTool: [{ value: "water-outages", total: 60 }],
    errorsByTool: [],
    outcomes: new Map([["water-outages", outcomes]]),
    actions: new Map([["water-outages", actions]]),
  };

  it("counts submitted, sent, confirmed and unsubscribed", () => {
    expect(shapeWaterAlerts(rows)).toEqual({
      submitted: 20,
      sent: 18,
      confirmed: 12,
      unsubscribed: 3,
    });
  });

  it("is all zeros before any sign-up event", () => {
    expect(
      shapeWaterAlerts({
        resultsByTool: [],
        actionsByTool: [],
        errorsByTool: [],
        outcomes: new Map(),
        actions: new Map(),
      }),
    ).toEqual({ submitted: 0, sent: 0, confirmed: 0, unsubscribed: 0 });
  });

  it("is null, not zeros, when a breakdown query failed", () => {
    // The water tool sent results, but its outcome breakdown is missing.
    expect(shapeWaterAlerts({ ...rows, outcomes: new Map() })).toBeNull();
    expect(shapeWaterAlerts({ ...rows, actions: new Map() })).toBeNull();
  });
});
