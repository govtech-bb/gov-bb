import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareProsePage, type ProsePageDocument } from "../../src/templates/prose-page-content";
import { ProsePage } from "../../src/templates/prose-page";

const document: ProsePageDocument = {
  frontmatter: { title: "A service", lede: "An introduction" },
  body: "## Before you start\n\nBring **identification**.\n\n:::details[More information]\nCall us.\n:::\n",
  path: "/services/example",
  breadcrumbs: [{ label: "Home", href: "/" }],
};

const render = (input = document) =>
  renderToStaticMarkup(<ProsePage page={prepareProsePage(input)} />).replace(
    /<style[^>]*>[\s\S]*?<\/style>/g,
    "",
  );

describe("design-system prose page template", () => {
  it("renders the public page chrome and GovBB Markdown without a landing renderer", () => {
    const html = render();
    expect(html).toContain("govbb-header");
    expect(html).toContain("govbb-footer");
    expect(html).toContain("Was this helpful?");
    expect(html).toContain("An introduction");
    expect(html).toContain("<strong>identification</strong>");
    expect(html).toContain("govbb-show-hide");
    expect(html).not.toContain("/cms-preview/");
    expect(html).not.toContain("<iframe");
  });

  it("keeps source metadata intact and accepts API-valid authoring metadata", () => {
    const input = {
      ...document,
      frontmatter: {
        title: "API page",
        source_url: "",
        stage: "beta",
        service_type: "other",
        keywords: [""],
      },
    };

    const before = structuredClone(input);
    expect(render(input)).toContain("API page");
    expect(render(input)).not.toContain("View the original source");
    expect(input).toEqual(before);
  });

  it("renders the introduction, UTC publication date, source notice and phone links", () => {
    const html = render({
      ...document,
      frontmatter: {
        ...document.frontmatter,
        publish_date: "2026-01-13",
        source_url: "https://www.gov.bb/original",
      },
      body: "| Help | Telephone |\n| --- | --- |\n| Office | (246) 123-4567 |\n",
    });

    expect(html).toContain("January 13th, 2026");
    expect(html).toContain("View the original source");
    expect(html).toContain('href="tel:+12461234567"');
  });

  it("does not invent a publication date or a live form", () => {
    const input = {
      ...document,
      frontmatter: { form_id: "example" },
      body: "<a data-start-link>Start now</a>",
    };

    expect(render(input)).toContain("Untitled page");
    expect(render(input)).not.toContain("Last updated on");
    expect(render(input)).not.toContain("Start now");
    expect(render({ ...input, formStatus: "available" })).toContain("Start now");
    const closed = render({ ...input, formStatus: "closed" });
    expect(closed).toContain("Applications for this service have closed.");
    expect(closed).not.toContain("Start now");
  });

  it("keeps the public method count aligned with form availability", () => {
    const html = render({
      ...document,
      frontmatter: { form_id: "example" },
      body: "There are two ways to apply.\n\n1. Online\n\n   <a data-start-link>Start now</a>\n\n2. In person\n",
    });

    expect(html).toContain("There is 1 way to apply.");
    expect(html).not.toContain("Start now");
  });

  it("supports existing legacy blocks through the shared Markdown renderer", () => {
    const html = render({
      ...document,
      body: '<muted caption>Small print</muted>\n\n<highlights><highlight title="Important">Bring ID.</highlight></highlights>',
    });

    expect(html).toContain("govbb-text-body-sm");
    expect(html).toContain("Important");
    expect(html).not.toContain("<highlight");
  });

  it("accepts editor-owned regions without rendering another body or editor", () => {
    const html = renderToStaticMarkup(
      <ProsePage
        page={prepareProsePage(document)}
        editableRegions={{
          title: <textarea aria-label="Title" />,
          lede: <textarea aria-label="Introduction" />,
          body: <div data-editor-body />,
        }}
      />,
    );

    expect(html).toContain('aria-label="Title"');
    expect(html).toContain("data-editor-body");
    expect(html).not.toContain("Bring");
  });

  it.each([
    "<script>alert(1)</script>",
    '<svg><set attributeName="href" to="javascript:alert(1)" /></svg>',
    '<img src="x" onerror="alert(1)">',
    "<style>body { display: none }</style>",
    '<iframe src="https://example.com"></iframe>',
    '<form><input name="password"></form>',
  ])("refuses executable or embedded HTML: %s", (body) => {
    expect(() => prepareProsePage({ ...document, body })).toThrow("Site preview");
  });

  it("refuses unsafe source URLs and malformed display metadata", () => {
    expect(() =>
      render({ ...document, frontmatter: { source_url: "javascript:alert(1)" } }),
    ).toThrow("Site preview");
    expect(() => render({ ...document, frontmatter: { title: { html: "unsafe" } } })).toThrow(
      "Site preview",
    );
    expect(() => render({ ...document, frontmatter: { publish_date: "not a date" } })).toThrow(
      "Site preview",
    );
  });
});
