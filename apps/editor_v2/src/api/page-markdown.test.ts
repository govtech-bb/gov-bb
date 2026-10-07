import { describe, expect, it } from "vitest";
import estate from "../../../api_v2/src/seed-data/estate.json";
import { createHeadlessEditor } from "../editor/core/create-editor";
import { $setPageMetadata } from "../pages/metadata";
import { govbbPageCodec, govbbPageEditor } from "../presets/govbb-page";
import type { ApiPage, TaxonomyCategory } from "./client";
import { markdownToSaveFields, pageToMarkdown } from "./page-markdown";

const VISIBILITIES = ["public", "preview", "draft"] as const;

const idOf = (key: string) => `id:${key}`;

const categories: TaxonomyCategory[] = estate.categories.map((category) => ({
  id: idOf(category.slug),
  parent_id: category.parent ? idOf(category.parent) : null,
  slug: category.slug,
  url: category.parent ? `/${category.parent}/${category.slug}` : `/${category.slug}`,
  title: category.title,
}));

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

const entry = pages.find((page) => page.url === "/money-financial-support/calculate-severance-pay");

const start = pages.find(
  (page) => page.url === "/money-financial-support/calculate-severance-pay/start",
);

if (!entry || !start) throw new Error("The seed no longer has the severance pages");

const markdownOf = (yaml: string) => `---\n${yaml}\n---\n\nBody`;

describe("page markdown", () => {
  it("saves every seeded service page as the API holds it", () => {
    for (const page of pages) {
      const saved = markdownToSaveFields(pageToMarkdown(page, categories), page, categories);

      if (page.parent_id === null && page.category_id === null) {
        // Not a service: the editor opens services only.
        expect(saved, page.url).toEqual({
          ok: false,
          errors: [{ field: "category", message: "Choose a category" }],
        });
        continue;
      }

      expect(saved, page.url).toEqual({
        ok: true,
        value: {
          url: page.url,
          category_id: page.parent_id === null ? page.category_id : null,
          title: page.title,
          description: page.description,
          visibility: page.visibility,
          form_id: page.form_id,
          body_markdown: page.body_markdown,
          frontmatter: page.frontmatter,
        },
      });
    }
  });

  it("never marks a page unsaved just for opening it", () => {
    for (const page of pages) {
      const markdown = pageToMarkdown(page, categories);
      const prepared = govbbPageCodec.prepare(markdown);

      if (prepared.mode !== "source")
        expect(govbbPageCodec.encode(prepared.state), page.url).toBe(markdown);
    }
  });

  it("saves a field edited in page details, and only that field", () => {
    const prepared = govbbPageCodec.prepare(pageToMarkdown(entry, categories));

    if (prepared.mode === "source") throw new Error("The entry page should open visually");
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

    editor.update(() => $setPageMetadata({ visibility: "draft", subcategory: undefined }), {
      discrete: true,
    });
    const edited = govbbPageCodec.encode(editor.getEditorState().toJSON());
    editor.dispose();

    const before = markdownToSaveFields(pageToMarkdown(entry, categories), entry, categories);
    const after = markdownToSaveFields(edited, entry, categories);

    if (!before.ok || !after.ok) throw new Error("Both versions should save");
    // An edit re-exports the body in the editor's normal form (a hard break becomes <br>).
    expect({ ...after.value, body_markdown: "" }).toEqual({
      ...before.value,
      visibility: "draft",
      body_markdown: "",
    });
  });

  it("files an entry page under the subcategory it names", () => {
    const saved = markdownToSaveFields(
      markdownOf(
        "title: Youth\nurl: /youth-and-community/arts-culture/yar\ncategory: youth-and-community\nsubcategory: arts-culture",
      ),
      entry,
      categories,
    );

    expect(saved.ok && saved.value.category_id).toBe(idOf("arts-culture"));
  });

  it("treats a page with no visibility as public, as page details shows it", () => {
    const saved = markdownToSaveFields(
      markdownOf("title: Severance\nurl: /money/severance\ncategory: money-financial-support"),
      entry,
      categories,
    );

    expect(saved.ok && saved.value.visibility).toBe("public");
  });

  it.each([
    ["an unknown key", "colour: blue", entry, "colour"],
    ["a publication date", "publish_date: 2026-01-01", entry, "publish_date"],
    ["two categories", "categories: [money-financial-support, work-employment]", entry, "category"],
    ["a category on a sub-page", "category: money-financial-support", start, "category"],
    ["a featured flag that is not true or false", "featured: often", entry, "featured"],
    ["keywords that are not a list", "keywords: severance", entry, "keywords"],
    ["a visibility the API does not have", "visibility: secret", entry, "visibility"],
  ])("refuses %s rather than dropping it", (_name, line, base, field) => {
    const category = base.parent_id === null ? "\ncategory: money-financial-support" : "";
    const yaml = `title: Severance\nurl: /money/severance${line.startsWith("categor") ? "" : category}\n${line}`;
    const saved = markdownToSaveFields(markdownOf(yaml), base, categories);

    expect(saved.ok ? [] : saved.errors.map((error) => error.field)).toEqual([field]);
  });

  it.each([
    ["no title", "url: /money/severance", "title"],
    ["no path", "title: Severance", "url"],
    ["a path ending in /", "title: Severance\nurl: /money/", "url"],
    ["a path without its leading /", "title: Severance\nurl: money/severance", "url"],
  ])("asks for what is missing when a page has %s", (_name, yaml, field) => {
    const saved = markdownToSaveFields(
      markdownOf(`${yaml}\ncategory: money-financial-support`),
      entry,
      categories,
    );

    expect(saved.ok ? [] : saved.errors.map((error) => error.field)).toEqual([field]);
  });
});
