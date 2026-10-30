import { describe, expect, it } from "vitest";
import { compileContentMarkdown } from "@govtech-bb/govbbmarkd";
import { sitePreviewDocument } from "../host/site-preview-renderer";
import estate from "../../../api_v2/src/seed-data/estate.json";
import { createHeadlessEditor } from "../editor/core/create-editor";
import { $setPageMetadata } from "../pages/metadata";
import { govbbPageCodec, govbbPageEditor } from "../presets/govbb-page";
import type { Category } from "./categories";
import type { ApiPage } from "./client";
import {
  markdownToPageSaveInput,
  pageToMarkdown,
  pickerCategories,
  suggestedUrl,
} from "./page-markdown";

const VISIBILITIES = ["public", "preview", "draft"] as const;

const idOf = (key: string) => `id:${key}`;

const categories: Category[] = estate.categories.map((category, position) => ({
  id: idOf(category.slug),
  parent_id: category.parent ? idOf(category.parent) : null,
  slug: category.slug,
  url: category.parent ? `/${category.parent}/${category.slug}` : `/${category.slug}`,
  title: category.title,
  description: null,
  position,
  services: 0,
  reserved_route: false,
  last_edited_by: null,
  updated_at: "2026-10-26T12:00:00.000Z",
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
  pending_revision: null,
  last_edited_by: null,
}));

const entry = pages.find((page) => page.url === "/money-financial-support/calculate-severance-pay");

const start = pages.find(
  (page) => page.url === "/money-financial-support/calculate-severance-pay/start",
);

if (!entry || !start) throw new Error("The seed no longer has the severance pages");

const markdownOf = (yaml: string) => `---\n${yaml}\n---\n\nBody`;

describe("page markdown", () => {
  it("keeps leading body rules and instructions through saving and both preview paths", () => {
    const body = "---\n\nYou must submit before Friday.\n\n---\n\nApply below.";
    const source = pageToMarkdown({ ...entry, body_markdown: body }, categories);
    const saved = markdownToPageSaveInput(source, entry, categories);

    if (!saved.ok) throw new Error("Expected valid page save");
    expect(saved.value.body_markdown).toBe(body);
    const publicPage = compileContentMarkdown(saved.value.body_markdown, { frontmatter: false });
    const localPreview = compileContentMarkdown(source);

    const sitePreview = compileContentMarkdown(sitePreviewDocument(source).body, {
      frontmatter: false,
    });

    expect(publicPage.ok && publicPage.value.text).toBe(
      "You must submit before Friday. Apply below.",
    );
    expect(localPreview.ok && localPreview.value.text).toBe(publicPage.ok && publicPage.value.text);
    expect(sitePreview.ok && sitePreview.value.text).toBe(publicPage.ok && publicPage.value.text);
  });

  it("saves every seeded service page as the API holds it", () => {
    for (const page of pages) {
      const saved = markdownToPageSaveInput(pageToMarkdown(page, categories), page, categories);

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

    editor.update(() => $setPageMetadata({ visibility: "preview", subcategory: undefined }), {
      discrete: true,
    });
    const edited = govbbPageCodec.encode(editor.getEditorState().toJSON());
    editor.dispose();

    const before = markdownToPageSaveInput(pageToMarkdown(entry, categories), entry, categories);
    const after = markdownToPageSaveInput(edited, entry, categories);

    if (!before.ok || !after.ok) throw new Error("Both versions should save");
    // An edit re-exports the body in the editor's normal form (a hard break becomes <br>).
    expect({ ...after.value, body_markdown: "" }).toEqual({
      ...before.value,
      visibility: "preview",
      body_markdown: "",
    });
  });

  it("keeps a legacy draft hidden when unrelated edits are saved", () => {
    const page: ApiPage = { ...entry, visibility: "draft" };
    const prepared = govbbPageCodec.prepare(pageToMarkdown(page, categories));

    if (prepared.mode === "source") throw new Error("The draft page should open visually");
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

    try {
      editor.update(() => $setPageMetadata({ title: "Edited hidden page" }), { discrete: true });

      const saved = markdownToPageSaveInput(
        govbbPageCodec.encode(editor.getEditorState().toJSON()),
        page,
        categories,
      );

      expect(saved.ok && saved.value.title).toBe("Edited hidden page");
      expect(saved.ok && saved.value.visibility).toBe("draft");
    } finally {
      editor.dispose();
    }
  });

  it("names the available visibility choices when an imported value cannot be saved", () => {
    const saved = markdownToPageSaveInput(
      markdownOf(
        "title: Severance\nurl: /money/severance\ncategory: money-financial-support\nvisibility: secret",
      ),
      entry,
      categories,
    );

    expect(saved).toEqual({
      ok: false,
      errors: [{ field: "visibility", message: "Choose Public or Preview link only" }],
    });
  });

  it("files an entry page under the subcategory it names", () => {
    const saved = markdownToPageSaveInput(
      markdownOf(
        "title: Youth\nurl: /youth-and-community/arts-culture/yar\ncategory: youth-and-community\nsubcategory: arts-culture",
      ),
      entry,
      categories,
    );

    expect(saved.ok && saved.value.category_id).toBe(idOf("arts-culture"));
  });

  it("treats a page with no visibility as public, as page details shows it", () => {
    const saved = markdownToPageSaveInput(
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
    const saved = markdownToPageSaveInput(markdownOf(yaml), base, categories);

    expect(saved.ok ? [] : saved.errors.map((error) => error.field)).toEqual([field]);
  });

  it.each([
    ["no title", "url: /money/severance", "title"],
    ["no path", "title: Severance", "url"],
    ["a path ending in /", "title: Severance\nurl: /money/", "url"],
    ["a path without its leading /", "title: Severance\nurl: money/severance", "url"],
  ])("asks for what is missing when a page has %s", (_name, yaml, field) => {
    const saved = markdownToPageSaveInput(
      markdownOf(`${yaml}\ncategory: money-financial-support`),
      entry,
      categories,
    );

    expect(saved.ok ? [] : saved.errors.map((error) => error.field)).toEqual([field]);
  });

  it("names categories that share a name by their addresses in page details' picker", () => {
    const row = (slug: string, title: string, parent?: string): Category => ({
      id: idOf(slug),
      parent_id: parent ? idOf(parent) : null,
      slug,
      title,
      url: parent ? `/${parent}/${slug}` : `/${slug}`,
      description: null,
      position: 0,
      services: 0,
      reserved_route: false,
      last_edited_by: null,
      updated_at: "2026-10-26T12:00:00.000Z",
    });

    const picked = pickerCategories([
      row("health", "Health"),
      row("health-care", "Health"),
      row("grants", "Grants", "health"),
      row("money", "Money"),
      row("money-grants", "Grants", "money"),
      row("pensions", "Pensions", "money"),
    ]);

    expect(picked).toEqual([
      {
        slug: "health",
        title: "Health (/health)",
        subcategories: [{ slug: "grants", title: "Grants (/health/grants)" }],
      },
      { slug: "health-care", title: "Health (/health-care)", subcategories: [] },
      {
        slug: "money",
        title: "Money",
        subcategories: [
          { slug: "money-grants", title: "Grants (/money/money-grants)" },
          { slug: "pensions", title: "Pensions" },
        ],
      },
    ]);
  });

  it("suggests a new page's path from its title, beneath its prefix", () => {
    expect(suggestedUrl("/money-financial-support", "Apply for a Grant!")).toBe(
      "/money-financial-support/apply-for-a-grant",
    );
    expect(suggestedUrl("/youth-and-community/arts-culture", "  Café crème -- 2026 ")).toBe(
      "/youth-and-community/arts-culture/cafe-creme-2026",
    );
  });
});
