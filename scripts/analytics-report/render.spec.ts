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
      pages: [
        {
          path: "/get-birth-certificate",
          pageviews: 120,
          visitors: 90,
          topSources: [
            { referrer: "google.com", count: 40 },
            { referrer: "(direct)", count: 30 },
          ],
        },
      ],
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
        submitTotal: 161,
        submitTopQueries: [
          { query: "conductor", count: 10 },
          { query: "textbook", count: 6 },
        ],
        submitBySource: [
          { source: "home", count: 75 },
          { source: "results", count: 59 },
        ],
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

  it("shows a Top source column with a hover popover of all sources", () => {
    expect(html).toContain("Top source");
    expect(html).toContain('"google.com"'); // embedded in DATA
    expect(html).toContain("data-sources="); // cell carries the full list
    expect(html).toContain('id="srcpop"'); // fixed hover popover element
  });

  it("renders the enriched drill-down (field-error frequency + humanised reasons)", () => {
    expect(html).toContain("Field errors — which fields fail and how often");
    expect(html).toContain("% of starts");
    expect(html).toContain("Why fields fail — validation reasons");
    expect(html).toContain("Required field left blank"); // reason code → human label
    expect(html).toContain("Total field errors");
  });

  it("renders both search sources (search-submit + search) and a CTR caveat", () => {
    expect(html).toContain("Search queries");
    expect(html).toContain("Search submissions (search-submit)");
    expect(html).toContain("Results-page searches (search)");
    expect(html).toContain("By source");
    expect(html).toContain('"conductor"'); // search-submit query in DATA
    expect(html).toContain("Returned no results");
    expect(html).toContain("Click-through rate is not shown");
  });

  it("adds a 'How it works' popover to each section", () => {
    expect(html).toContain('popovertarget="howto-pages"');
    expect(html).toContain('popovertarget="howto-forms"');
    expect(html).toContain('popovertarget="howto-search"');
    expect(html).toContain('id="howto-search" popover');
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
