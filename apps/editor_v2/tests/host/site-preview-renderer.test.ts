import { describe, expect, it } from "vitest";
import { sitePreviewDocument } from "../../src/host/site-preview-renderer";

describe("site preview display contract", () => {
  it("keeps all frontmatter and passes the original Markdown, not reader HTML", () => {
    const source =
      "---\ntitle: A page\nsource_url: https://www.gov.bb/original\ncustom: [one, two]\nurl: /work-employment/service/start\n---\n\nCall (246) 123-4567.\n";

    const document = sitePreviewDocument(source);
    expect(document.frontmatter).toMatchObject({
      source_url: "https://www.gov.bb/original",
      custom: ["one", "two"],
    });
    expect(document.body).toBe("\n\nCall (246) 123-4567.\n");
    expect(document.path).toBe("/work-employment/service/start");
    expect(document.formStatus).toBeUndefined();
    expect(document.frontmatter.publish_date).toBeUndefined();
  });

  it("uses an explicit publication date and breadcrumbs without inventing either", () => {
    const source = "---\ntitle: Test\npublish_date: 2020-01-01\n---\nBody";

    const breadcrumbs = [
      { label: "Home", href: "/" },
      { label: "Service", href: "/service" },
    ];

    expect(
      sitePreviewDocument(source, { breadcrumbs, publishedAt: null }).frontmatter.publish_date,
    ).toBeUndefined();
    expect(
      sitePreviewDocument(source, { breadcrumbs, publishedAt: "2026-01-13T00:00:00Z" }),
    ).toMatchObject({
      breadcrumbs,
      frontmatter: { publish_date: "2026-01-13T00:00:00Z" },
    });
  });

  it.each([
    "//example.com/",
    "/\\example.com",
    "https://example.com/",
    "/page?next=other",
    "/page#fragment",
  ])("refuses a path that could escape the preview router: %s", (path) => {
    expect(() => sitePreviewDocument(`---\ntitle: Test\nurl: '${path}'\n---\nBody`)).toThrow(
      "local page path",
    );
  });

  it("keeps a body with no YAML intact", () => {
    expect(sitePreviewDocument("Plain **Markdown**\n").body).toBe("Plain **Markdown**\n");
  });
});
