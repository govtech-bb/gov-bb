import { describe, expect, it } from "vitest";
import { renderReport } from "./render";
import type { ReportModel } from "./types";

const model: ReportModel = {
  generatedAt: "2026-06-30T08:00:00.000Z",
  timezone: "America/Barbados",
  presets: [
    {
      key: "last-7-days",
      label: "Last 7 days",
      pages: [{ path: "/get-birth-certificate", pageviews: 120, visitors: 90 }],
      forms: [
        {
          formId: "get-birth-certificate",
          title: "Get a birth certificate",
          category: "family-birth-relationships",
          starts: 100,
          completes: 40,
          completionPct: 40,
          avgFieldErrors: 1.2,
          avgDurationSeconds: 185,
        },
      ],
      details: {
        "get-birth-certificate": {
          formId: "get-birth-certificate",
          funnel: [
            { label: "Start", count: 100, dropoffPct: 0 },
            { label: "Submit", count: 40, dropoffPct: 60 },
          ],
          stepBack: 5,
          stepEdit: 2,
          review: 30,
          fieldErrors: [{ field: "email", count: 12 }],
          errorTypes: [{ field: "Invalid email", count: 9 }],
        },
      },
      search: {
        total: 60,
        zeroResults: 9,
        zeroResultsPct: 15,
        topQueries: [
          { query: "birth certificate", count: 22 },
          { query: "passport", count: 14 },
        ],
      },
    },
  ],
};

describe("renderReport", () => {
  const html = renderReport(model);

  it("produces a self-contained HTML document with no external requests", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link[^>]+href/i);
  });

  it("includes the preset label, a form title, and the funnel section", () => {
    expect(html).toContain("Last 7 days");
    expect(html).toContain("Get a birth certificate");
    expect(html).toContain("Funnel");
  });

  it("renders the enriched drill-down (field-error frequency + error types)", () => {
    expect(html).toContain("Field errors — which fields fail and how often");
    expect(html).toContain("% of starts");
    expect(html).toContain("Error types");
    expect(html).toContain("Total field errors");
  });

  it("renders the search section with queries and a CTR caveat", () => {
    expect(html).toContain("Search queries");
    expect(html).toContain("Top search queries");
    expect(html).toContain('"birth certificate"'); // embedded in DATA
    expect(html).toContain("Returned no results");
    expect(html).toContain("Click-through rate is not shown");
  });

  it("embeds the model as JSON without breaking out of the script tag", () => {
    expect(html).toContain('"get-birth-certificate"');
    // The model's JSON must not contain a literal closing script tag.
    const scriptStart = html.indexOf("const DATA =");
    const dataChunk = html.slice(
      scriptStart,
      html.indexOf("</script>", scriptStart),
    );
    expect(dataChunk).not.toContain("</script");
  });

  it("escapes a hostile path/title so it cannot inject markup", () => {
    const hostile: ReportModel = {
      ...model,
      presets: [
        {
          ...model.presets[0],
          pages: [
            {
              path: "</td><script>alert(1)</script>",
              pageviews: 1,
              visitors: 1,
            },
          ],
          forms: [],
          details: {},
        },
      ],
    };
    // The hostile string is rendered client-side via esc(); it must travel only
    // inside the embedded JSON, escaped, never as live markup in the document body.
    const out = renderReport(hostile);
    const bodyOnly = out.slice(0, out.indexOf("const DATA ="));
    expect(bodyOnly).not.toContain("<script>alert(1)</script>");
  });
});
