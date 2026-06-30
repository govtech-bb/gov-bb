import { describe, expect, it } from "vitest";
import {
  aggregateFormEvents,
  buildFormDetail,
  buildFormRows,
  buildFunnel,
  buildPageRows,
  buildSearchReport,
  parseEventName,
  tallyFields,
  weightedAverage,
  weightedSum,
  type FormDetailSource,
  type FormEventAgg,
} from "./metrics";
import type { FormMeta } from "./types";

describe("parseEventName", () => {
  it("splits a prefixed event into form id and base event", () => {
    expect(parseEventName("get-birth-certificate:form-start")).toEqual({
      formId: "get-birth-certificate",
      event: "form-start",
    });
  });
  it("splits on the first colon only", () => {
    expect(parseEventName("renew-passport:form-step-one")).toEqual({
      formId: "renew-passport",
      event: "form-step-one",
    });
  });
  it("returns null for unprefixed events", () => {
    expect(parseEventName("page-service-view")).toBeNull();
    expect(parseEventName(":leading")).toBeNull();
    expect(parseEventName("trailing:")).toBeNull();
  });
});

describe("aggregateFormEvents", () => {
  it("groups counts by form id and orders per-step completions", () => {
    const agg = aggregateFormEvents([
      { x: "birth-cert:form-start", y: 100 },
      { x: "birth-cert:form-submit", y: 40 },
      { x: "birth-cert:form-step-two", y: 70 },
      { x: "birth-cert:form-step-one", y: 90 },
      { x: "birth-cert:form-step-back", y: 12 },
      { x: "passport:form-start", y: 50 },
      { x: "page-service-view", y: 999 }, // unprefixed → ignored
    ]);
    const birth = agg.get("birth-cert")!;
    expect(birth.counts).toMatchObject({
      "form-start": 100,
      "form-submit": 40,
      "form-step-back": 12,
    });
    expect(birth.steps).toEqual([
      { step: 1, count: 90 },
      { step: 2, count: 70 },
    ]);
    expect(agg.get("passport")!.counts["form-start"]).toBe(50);
    expect(agg.has("page-service-view")).toBe(false);
  });
});

describe("weightedAverage / weightedSum", () => {
  it("computes a weighted average of numeric values", () => {
    // (10*2 + 20*3) / (2+3) = 80/5 = 16
    expect(
      weightedAverage([
        { value: 10, total: 2 },
        { value: "20", total: 3 },
      ]),
    ).toBe(16);
  });
  it("returns null when there are no observations", () => {
    expect(weightedAverage([])).toBeNull();
  });
  it("ignores non-numeric values", () => {
    expect(
      weightedSum([
        { value: "5", total: 2 },
        { value: "n/a", total: 9 },
      ]),
    ).toBe(10);
  });
});

describe("tallyFields", () => {
  it("splits comma-joined field lists and sums per field, sorted desc", () => {
    const rows = tallyFields([
      { value: "first-name,email", total: 3 },
      { value: "email", total: 5 },
      { value: "first-name", total: 1 },
    ]);
    expect(rows).toEqual([
      { field: "email", count: 8 },
      { field: "first-name", count: 4 },
    ]);
  });
});

describe("buildPageRows", () => {
  it("maps, sorts by pageviews desc, and truncates to topN", () => {
    const rows = buildPageRows(
      [
        { x: "/a", pageviews: 10, visitors: 8 },
        { x: "/b", pageviews: 50, visitors: 30 },
        { name: "/c", pageviews: 20, visitors: 15 },
      ],
      2,
    );
    expect(rows).toEqual([
      { path: "/b", pageviews: 50, visitors: 30 },
      { path: "/c", pageviews: 20, visitors: 15 },
    ]);
  });
});

describe("buildFormRows", () => {
  const agg = new Map<string, FormEventAgg>([
    [
      "birth-cert",
      { counts: { "form-start": 100, "form-submit": 40 }, steps: [] },
    ],
    ["passport", { counts: { "form-start": 0, "form-submit": 0 }, steps: [] }],
  ]);
  const meta = new Map<string, FormMeta>([
    [
      "birth-cert",
      {
        title: "Get a birth certificate",
        category: "family-birth-relationships",
      },
    ],
  ]);
  const details = new Map<string, FormDetailSource>([
    [
      "birth-cert",
      {
        duration: [
          { value: 120, total: 2 },
          { value: 240, total: 2 },
        ], // avg 180s
        errorCount: [{ value: 2, total: 50 }], // total 100 field errors
        fields: [],
        errorTypes: [],
      },
    ],
  ]);

  it("computes completion %, avg field errors, avg duration; resolves title/category", () => {
    const rows = buildFormRows(agg, meta, details, 10);
    expect(rows[0]).toEqual({
      formId: "birth-cert",
      title: "Get a birth certificate",
      category: "family-birth-relationships",
      starts: 100,
      completes: 40,
      completionPct: 40,
      avgFieldErrors: 1, // 100 / 100
      avgDurationSeconds: 180,
    });
  });

  it("guards divide-by-zero and falls back title/category to id/uncategorised", () => {
    const rows = buildFormRows(agg, meta, details, 10);
    const passport = rows.find((r) => r.formId === "passport")!;
    expect(passport).toMatchObject({
      title: "passport",
      category: "uncategorised",
      completionPct: 0,
      avgFieldErrors: 0,
      avgDurationSeconds: null,
    });
  });

  it("sorts by starts desc and truncates to topN", () => {
    expect(buildFormRows(agg, meta, details, 1).map((r) => r.formId)).toEqual([
      "birth-cert",
    ]);
  });
});

describe("buildFunnel", () => {
  it("builds start → steps → submit with drop-off percentages", () => {
    const entry: FormEventAgg = {
      counts: { "form-start": 100, "form-submit": 45 },
      steps: [
        { step: 1, count: 80 },
        { step: 2, count: 60 },
      ],
    };
    expect(buildFunnel(entry)).toEqual([
      { label: "Start", count: 100, dropoffPct: 0 },
      { label: "Step 1", count: 80, dropoffPct: 20 },
      { label: "Step 2", count: 60, dropoffPct: 25 },
      { label: "Submit", count: 45, dropoffPct: 25 },
    ]);
  });
});

describe("buildFormDetail", () => {
  it("assembles funnel, friction counts, and field-error tally", () => {
    const entry: FormEventAgg = {
      counts: {
        "form-start": 10,
        "form-submit": 5,
        "form-step-back": 3,
        "form-step-edit": 2,
        "form-review": 4,
      },
      steps: [{ step: 1, count: 8 }],
    };
    const source: FormDetailSource = {
      duration: [],
      errorCount: [],
      fields: [{ value: "email,phone", total: 2 }],
      errorTypes: [
        { value: "Required", total: 5 },
        { value: "Invalid email", total: 2 },
      ],
    };
    const detail = buildFormDetail("x", entry, source);
    expect(detail.stepBack).toBe(3);
    expect(detail.stepEdit).toBe(2);
    expect(detail.review).toBe(4);
    expect(detail.fieldErrors).toEqual([
      { field: "email", count: 2 },
      { field: "phone", count: 2 },
    ]);
    expect(detail.errorTypes).toEqual([
      { field: "Required", count: 5 },
      { field: "Invalid email", count: 2 },
    ]);
    expect(detail.funnel.map((s) => s.label)).toEqual([
      "Start",
      "Step 1",
      "Submit",
    ]);
  });
});

describe("buildSearchReport", () => {
  it("ranks queries by count and computes the zero-results rate", () => {
    const report = buildSearchReport(
      [
        { value: "passport", total: 30 },
        { value: "birth certificate", total: 50 },
        { value: "tax", total: 20 },
      ],
      [
        { value: 0, total: 25 },
        { value: 3, total: 75 },
      ],
      2,
    );
    expect(report.total).toBe(100);
    expect(report.zeroResults).toBe(25);
    expect(report.zeroResultsPct).toBe(25);
    expect(report.topQueries).toEqual([
      { query: "birth certificate", count: 50 },
      { query: "passport", count: 30 },
    ]);
  });

  it("is safe with no search activity", () => {
    const report = buildSearchReport([], [], 10);
    expect(report).toEqual({
      total: 0,
      zeroResults: 0,
      zeroResultsPct: 0,
      topQueries: [],
    });
  });
});
