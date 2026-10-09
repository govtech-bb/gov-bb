import { describe, expect, it } from "vitest";
import estate from "../../../api_v2/src/seed-data/estate.json";
import type { ApiPage, SaveFields } from "../api/client";
import { canonicalBody, savePage } from "./api-pages";
import { detailsOf, detailsProblems, sameDetails, withLede } from "./page-details";

const VISIBILITIES = ["public", "preview", "draft"] as const;

const idOf = (key: string) => `id:${key}`;

const pages: ApiPage[] = estate.pages.map((page) => ({
  id: idOf(page.url),
  url: page.url,
  slug: page.url.split("/").at(-1) ?? "",
  category_id: page.category ? idOf(page.category) : null,
  parent_id: page.parent ? idOf(page.parent) : null,
  title: page.title,
  description: page.description,
  visibility: VISIBILITIES.find((visibility) => visibility === page.visibility) ?? "draft",
  form_id: page.form_id,
  body_markdown: page.body_markdown,
  frontmatter: page.frontmatter,
  published_at: page.published_at,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
}));

async function sent(page: ApiPage, details = detailsOf(page)) {
  const fields: SaveFields[] = [];
  const base = { page, body: canonicalBody(page.body_markdown) };

  const outcome = await savePage(
    {
      savePage: async (_id, saved) => {
        fields.push(saved);

        return page;
      },
    },
    base,
    details,
    base.body,
  );

  return { outcome, fields };
}

describe("page details", () => {
  it("saves every seeded service page as the API holds it", async () => {
    for (const page of pages) {
      const { outcome, fields } = await sent(page);

      if (page.parent_id === null && page.category_id === null) {
        // Not a service: the editor opens services only.
        expect(outcome, page.url).toEqual({
          kind: "invalid",
          errors: [{ field: "category", message: "Choose a category" }],
        });
        continue;
      }

      expect(fields, page.url).toEqual([
        {
          url: page.url,
          category_id: page.parent_id === null ? page.category_id : null,
          title: page.title,
          description: page.description,
          visibility: page.visibility,
          form_id: page.form_id,
          body_markdown: page.body_markdown,
          frontmatter: page.frontmatter,
        },
      ]);
    }
  });

  it("never marks a page unsaved just for opening it", () => {
    for (const page of pages) {
      const body = canonicalBody(page.body_markdown);
      expect(canonicalBody(body), page.url).toBe(body);
    }
  });

  it("saves an edited title without rewriting the body", async () => {
    const page = pages.find(
      (item) =>
        item.category_id !== null && canonicalBody(item.body_markdown) !== item.body_markdown,
    );

    if (!page) throw new Error("The seed no longer has a page the editor writes differently");

    const { fields } = await sent(page, { ...detailsOf(page), title: "A new title" });

    expect(fields[0]).toMatchObject({ title: "A new title", body_markdown: page.body_markdown });
  });

  it("asks for what the content API would refuse", () => {
    const details = detailsOf(pages.find((page) => page.parent_id === null && page.category_id)!);

    expect(detailsProblems({ ...details, title: "" }, true)).toEqual([
      { field: "title", message: "Enter a title" },
    ]);
    expect(detailsProblems({ ...details, title: "x".repeat(301) }, true)).toEqual([
      { field: "title", message: "Enter a title of 300 characters or fewer" },
    ]);
    expect(detailsProblems({ ...details, url: "" }, true)).toEqual([
      { field: "url", message: "Enter a path" },
    ]);
    expect(detailsProblems({ ...details, url: "money/" }, true)).toEqual([
      { field: "url", message: "Enter a path that starts with / and does not end with /" },
    ]);
    expect(detailsProblems({ ...details, form_id: "f".repeat(101) }, true)).toEqual([
      { field: "form_id", message: "Enter a form ID of 100 characters or fewer" },
    ]);
    expect(detailsProblems({ ...details, category_id: null }, true)).toEqual([
      { field: "category", message: "Choose a category" },
    ]);
    expect(detailsProblems({ ...details, category_id: null }, false)).toEqual([]);
  });

  it("compares details by value and drops an empty introduction", () => {
    const details = { ...detailsOf(pages[0]!), frontmatter: { lede: "Intro", stage: "alpha" } };
    const reordered = { ...details, frontmatter: { stage: "alpha", lede: "Intro" } };

    expect(sameDetails(details, reordered)).toBe(true);
    expect(sameDetails(details, withLede(details, "Changed"))).toBe(false);
    expect(withLede(details, "").frontmatter).toEqual({ stage: "alpha" });
  });
});
