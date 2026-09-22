import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BANK_HOLIDAY_RULES } from "../holiday-rules";
import type { Block, PageDocument } from "../types";
import { RenderDocument } from "./document";

const doc = (blocks: Block[]): PageDocument => ({
  version: 1,
  id: "doc-1",
  url: "/test",
  slug: "test",
  schema_name: "guide",
  document_type: "test",
  title: "A test page",
  description: null,
  is_draft: false,
  body: { version: 1, blocks, refs: {} },
  updated_at: "2026-09-22T00:00:00.000Z",
});

const render = (blocks: Block[], data = {}) =>
  renderToStaticMarkup(<RenderDocument doc={doc(blocks)} data={data} />);

describe("prose blocks", () => {
  it("renders marks as nested elements, not as escaped text", () => {
    const html = render([
      {
        id: "b1",
        type: "paragraph",
        content: [
          { text: "This tool only gives an " },
          { text: "estimate", marks: ["strong"] },
          { text: " based on the Act." },
        ],
      },
    ]);
    expect(html).toContain("<strong>estimate</strong>");
    expect(html).toContain("This tool only gives an ");
  });

  it("nests multiple marks", () => {
    const html = render([
      {
        id: "b1",
        type: "paragraph",
        content: [{ text: "both", marks: ["strong", "em"] }],
      },
    ]);
    expect(html).toContain("<em><strong>both</strong></em>");
  });

  it("preserves the em dash", () => {
    const html = render([
      {
        id: "b1",
        type: "list",
        ordered: false,
        items: [
          {
            id: "i1",
            content: [
              { text: "your usual gross pay — include overtime or bonuses" },
            ],
          },
        ],
      },
    ]);
    expect(html).toContain("gross pay — include overtime or bonuses");
  });

  it("renders the stored anchor as the heading id, not one re-derived from the text", () => {
    const html = render([
      {
        id: "b1",
        type: "heading",
        level: 2,
        anchor: "legacy-anchor-someone-linked-to",
        content: [{ text: "A heading whose text has since changed" }],
      },
    ]);
    expect(html).toContain('id="legacy-anchor-someone-linked-to"');
  });

  it("escapes user text rather than emitting it as markup", () => {
    const html = render([
      {
        id: "b1",
        type: "paragraph",
        content: [{ text: "<script>alert(1)</script>" }],
      },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a start_link as an anchor carrying its target kind", () => {
    const html = render([
      {
        id: "b1",
        type: "start_link",
        label: "Start your estimate now",
        target_kind: "page",
        target: "/money-financial-support/calculate-severance-pay/form",
      },
    ]);
    expect(html).toContain('data-kind="page"');
    expect(html).toContain(
      'href="/money-financial-support/calculate-severance-pay/form"',
    );
    expect(html).toContain("Start your estimate now");
  });

  it("renders ordered and unordered lists differently", () => {
    const items = [{ id: "i1", content: [{ text: "one" }] }];
    expect(
      render([{ id: "b1", type: "list", ordered: true, items }]),
    ).toContain("<ol");
    expect(
      render([{ id: "b1", type: "list", ordered: false, items }]),
    ).toContain("<ul");
  });
});

describe("the finder island", () => {
  const pharmacies = [
    {
      slug: "a",
      name: "Alpha",
      type: "government",
      pppStatus: "not-applicable",
      parish: "St. Michael",
    },
    {
      slug: "b",
      name: "Beta",
      type: "private",
      pppStatus: "participating",
      parish: "Christ Church",
    },
    {
      slug: "c",
      name: "Gamma",
      type: "private",
      pppStatus: "not-participating",
      parish: "St. James",
    },
  ];

  const finder = (overrides = {}): Block =>
    ({
      id: "f1",
      type: "finder",
      collection: "pharmacies",
      document_noun: "pharmacy",
      results_per_page: 20,
      empty_message: "Nothing found.",
      search: { enabled: true, label: "Search", fields: ["name"] },
      facets: [],
      sort: [],
      result_template: {
        title: "name",
        metadata: ["parish"],
        detail_url: "/p/{slug}",
      },
      ...overrides,
    }) as Block;

  it("pluralises the configured noun correctly", () => {
    const html = render([finder()], { pharmacies });
    expect(html).toContain("3 pharmacies");
    expect(html).not.toContain("pharmacys");
  });

  it("renders one fieldset per facet, keyed for the sidebar", () => {
    const html = render(
      [
        finder({
          facets: [
            { key: "parish", name: "Parish", type: "checkbox" },
            {
              key: "openNow",
              name: "Open now",
              type: "checkbox",
              computed_from: "hours",
            },
          ],
        }),
      ],
      { pharmacies },
    );
    expect(html).toContain('data-facet="parish"');
    expect(html).toContain('data-facet="openNow"');
  });

  it("applies a facet default at first render — subsidisedOnly filters out non-participating privates", () => {
    const html = render(
      [
        finder({
          facets: [
            {
              key: "subsidisedOnly",
              name: "Free or subsidised only",
              type: "checkbox",
              computed_from: ["type", "pppStatus"],
              allowed_values: [{ value: "yes", label: "Yes", default: true }],
            },
          ],
        }),
      ],
      { pharmacies },
    );
    // Gamma is private and not participating, so it drops out.
    expect(html).toContain("2 pharmacies");
    expect(html).not.toContain("Gamma");
  });

  it("substitutes the record field into the detail url", () => {
    const html = render([finder()], { pharmacies });
    expect(html).toContain('href="/p/a"');
  });

  it("paginates by results_per_page", () => {
    const html = render([finder({ results_per_page: 2 })], { pharmacies });
    expect(html).toContain("Page 1 of 2");
  });

  it("shows the configured empty message when nothing matches", () => {
    const html = render([finder()], { pharmacies: [] });
    expect(html).toContain("Nothing found.");
  });

  it("shows a loading state instead of the empty message while records arrive", () => {
    const html = renderToStaticMarkup(
      <RenderDocument
        doc={doc([finder()])}
        data={{ pharmacies: [] }}
        loading
      />,
    );
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Nothing found.");
  });
});

describe("the calendar island", () => {
  const calendar: Block = {
    id: "c1",
    type: "calendar",
    collection: "bank-holiday-rules",
    year_range: { min: 2020, max: 2050 },
    substitution_rule: "cap-352",
    show_past: true,
    columns: [
      { field: "date", label: "Date", format: "long_date" },
      { field: "name", label: "Holiday" },
    ],
  };

  const data = {
    "bank-holiday-rules": BANK_HOLIDAY_RULES as unknown as Array<
      Record<string, unknown>
    >,
  };

  it("renders a column per configured column", () => {
    const html = render([calendar], data);
    expect(html).toContain('<th scope="col">Date</th>');
    expect(html).toContain('<th scope="col">Holiday</th>');
  });

  it("renders every holiday for the current year", () => {
    const html = render([calendar], data);
    expect(html).toContain("New Year&#x27;s Day");
    expect(html).toContain("Kadooment Day");
    expect(html).toContain("Independence Day");
  });

  it("offers the configured year range", () => {
    const html = render([calendar], data);
    expect(html).toContain('<option value="2020">');
    expect(html).toContain('<option value="2050">');
    expect(html).not.toContain('<option value="2051">');
  });
});

describe("the data table", () => {
  it("renders rows from the collection its source ref names", () => {
    const html = renderToStaticMarkup(
      <RenderDocument
        doc={{
          ...doc([
            {
              id: "t1",
              type: "data_table",
              source: "q",
              columns: [{ field: "name", label: "Name" }],
              empty_message: "None.",
            },
          ]),
          body: {
            version: 1,
            blocks: [
              {
                id: "t1",
                type: "data_table",
                source: "q",
                columns: [{ field: "name", label: "Name" }],
                empty_message: "None.",
              },
            ],
            refs: { q: { kind: "query", collection: "parishes" } },
          },
        }}
        data={{ parishes: [{ name: "St. Lucy" }, { name: "St. Peter" }] }}
      />,
    );
    expect(html).toContain("St. Lucy");
    expect(html).toContain("St. Peter");
  });
});

describe("image_placeholder", () => {
  it("renders a labelled box and an optional caption", () => {
    const html = render([
      {
        id: "i1",
        type: "image_placeholder",
        alt: "A map",
        caption: "Figure 1",
      },
    ]);
    expect(html).toContain('aria-label="A map"');
    expect(html).toContain("Figure 1");
  });
});
