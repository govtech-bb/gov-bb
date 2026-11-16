import { describe, expect, it } from "vitest";
import type { SeedEstate, SeedPage } from "../seed-data";
import { Difference, estateDifferences } from "./estate-drift";
import type { PublicPage } from "./page-visibility";

const page = (over: Partial<SeedPage> & { url: string }): SeedPage => ({
  category: null,
  parent: null,
  title: over.url,
  description: "d",
  visibility: "public",
  form_id: null,
  content_slug: over.url,
  published_at: null,
  body_markdown: `body ${over.url}`,
  frontmatter: {},
  ...over,
});

const category = (slug: string, parent: string | null) => ({
  slug,
  title: slug,
  description: null,
  parent,
  position: 0,
});

const estate: SeedEstate = {
  categories: [
    category("top", null),
    category("sub", "top"),
    category("other", null),
  ],
  pages: [
    page({ url: "/a", category: "sub", visibility: "preview" }),
    page({ url: "/b", category: "top", form_id: "f" }),
    page({ url: "/b/c", category: "top", parent: "/b", description: "" }),
    page({ url: "/loose" }),
    page({ url: "/hidden", category: "top", visibility: "draft" }),
  ],
};

/** The page as GET /pages serves it, built from the snapshot page. */
function served(url: string, over: Partial<PublicPage> = {}): PublicPage {
  const p = estate.pages.find((x) => x.url === url) ?? page({ url });
  const cat = estate.categories.find((c) => c.slug === p.category);
  const category = cat ? (cat.parent ?? cat.slug) : null;
  const subcategory = cat?.parent ? cat.slug : null;
  const crumbs = [category, subcategory]
    .filter((s) => s !== null)
    .map((s) => ({ name: s, url: `/${s}` }));
  const above = p.parent ? [{ name: p.parent, url: p.parent }] : [];
  return {
    url,
    frontmatter: {
      title: p.title,
      ...(p.description ? { description: p.description } : {}),
    },
    body_markdown: p.body_markdown,
    form_id: p.form_id,
    hide_start_links: false,
    breadcrumbs: [...crumbs, ...above, { name: p.title, url }],
    category,
    subcategory,
    visibility: p.visibility === "draft" ? "preview" : p.visibility,
    published_at: null,
    content_updated_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  } as PublicPage;
}

// /hidden is a draft: the token never reads it, so it is not in `served`.
const urls = ["/a", "/b", "/b/c", "/loose"];
const run = (
  over: Record<string, PublicPage | null> = {},
  listed: string[] = urls,
) =>
  estateDifferences(
    estate,
    new Map(urls.map((u) => [u, over[u] === undefined ? served(u) : over[u]])),
    listed,
  );

describe("estateDifferences", () => {
  it("reports nothing when every page matches, draft pages absent", () => {
    expect(run()).toEqual([]);
  });

  it("reports a body difference on a preview page", () => {
    expect(run({ "/a": served("/a", { body_markdown: "changed" }) })).toEqual([
      {
        kind: "field",
        url: "/a",
        field: "body_markdown",
        expected: "body /a",
        actual: "changed",
      },
    ]);
  });

  it("reports a title difference", () => {
    expect(
      run({
        "/b": {
          ...served("/b"),
          frontmatter: { title: "new", description: "d" },
        },
      }),
    ).toEqual([
      {
        kind: "field",
        url: "/b",
        field: "title",
        expected: "/b",
        actual: "new",
      },
    ]);
  });

  it("reports a category and subcategory difference", () => {
    // /a is filed under "sub" (in "top"); served under "other".
    const moved = served("/a", {
      category: "other",
      subcategory: null,
      breadcrumbs: [
        { name: "other", url: "/other" },
        { name: "/a", url: "/a" },
      ],
    });
    expect(run({ "/a": moved })).toEqual([
      {
        kind: "field",
        url: "/a",
        field: "category",
        expected: "top",
        actual: "other",
      },
      {
        kind: "field",
        url: "/a",
        field: "subcategory",
        expected: "sub",
        actual: null,
      },
    ]);
  });

  it("reports a page served as 404 as missing", () => {
    expect(run({ "/loose": null })).toEqual([
      { kind: "missing", url: "/loose" },
    ]);
  });

  it("reports a listed url the snapshot lacks as extra", () => {
    expect(run({}, [...urls, "/new"])).toEqual([
      { kind: "extra", url: "/new" },
    ]);
  });

  it("accepts every entry with the Difference schema", () => {
    const diffs = run(
      { "/a": served("/a", { body_markdown: "x" }), "/loose": null },
      [...urls, "/new"],
    );
    expect(diffs).toHaveLength(3);
    for (const d of diffs) expect(Difference.parse(d)).toEqual(d);
  });
});
