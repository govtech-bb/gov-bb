import { isMap, isScalar, isSeq, parseDocument, stringify } from "yaml";
import { parsePageMarkdown } from "../pages/markdown";
import type { ApiPage, FieldError, SaveFields, TaxonomyCategory } from "./client";

const TEXT_FRONTMATTER = ["stage", "section", "service_type", "source_url"] as const;

const KNOWN_KEYS = new Set([
  "title",
  "lede",
  "description",
  "url",
  "category",
  "categories",
  "subcategory",
  "visibility",
  "form_id",
  "featured",
  "keywords",
  "publish_date",
  ...TEXT_FRONTMATTER,
]);

const VISIBILITIES = ["public", "preview", "draft"] as const;

/** The editor's Markdown for a page: its fields as YAML frontmatter, then its body. */
export function pageToMarkdown(page: ApiPage, categories: readonly TaxonomyCategory[]) {
  const values = new Map<string, string | boolean | string[]>([["title", page.title]]);

  if (page.frontmatter.lede !== undefined) values.set("lede", page.frontmatter.lede);

  if (page.description !== null) values.set("description", page.description);
  values.set("url", page.url);

  // A sub-page is filed with the page above it, so only a service's entry names a category.
  const category = categories.find((entry) => entry.id === page.category_id);

  if (page.parent_id === null && category) {
    const parent = categories.find((entry) => entry.id === category.parent_id);
    values.set("category", parent?.slug ?? category.slug);

    if (parent) values.set("subcategory", category.slug);
  }

  if (page.visibility !== "public") values.set("visibility", page.visibility);

  if (page.form_id !== null) values.set("form_id", page.form_id);

  for (const key of TEXT_FRONTMATTER) {
    const value = page.frontmatter[key];

    if (value !== undefined) values.set(key, value);
  }

  if (page.frontmatter.featured !== undefined) values.set("featured", page.frontmatter.featured);

  if (page.frontmatter.keywords !== undefined) values.set("keywords", page.frontmatter.keywords);

  return `---\n${stringify(Object.fromEntries(values)).trimEnd()}\n---\n\n${page.body_markdown}`;
}

/** Why a path cannot be a page's url, or undefined when it can. */
export function urlProblem(url: string) {
  if (!/^\/[^?#]*[^/?#]$/.test(url))
    return "Enter a path that starts with / and does not end with /";

  if (url.length > 512) return "Enter a path of 512 characters or fewer";

  if ((url.split("/").at(-1) ?? "").length > 200)
    return "Enter a last path segment of 200 characters or fewer";

  return undefined;
}

export type SaveFieldsResult =
  | { ok: true; value: SaveFields }
  | { ok: false; errors: FieldError[] };

/**
 * The save the editor's Markdown asks for, or every field it cannot send. A
 * key the API does not keep is refused rather than dropped, so nothing an
 * author wrote disappears on save.
 */
export function markdownToSaveFields(
  markdown: string,
  base: ApiPage,
  categories: readonly TaxonomyCategory[],
): SaveFieldsResult {
  const first = parsePageMarkdown(markdown).children[0];
  const yaml = first?.type === "yaml" ? first : undefined;
  const document = parseDocument(yaml?.value ?? "");
  const errors: FieldError[] = [];

  const text = (key: string) => {
    const value = document.get(key);

    if (value === undefined || value === null) return undefined;

    if (typeof value === "string") return value;
    errors.push({ field: key, message: "Enter text" });

    return undefined;
  };

  const keys = isMap(document.contents)
    ? document.contents.items.map((pair) => (isScalar(pair.key) ? String(pair.key.value) : ""))
    : [];

  for (const key of keys) {
    if (!KNOWN_KEYS.has(key))
      errors.push({ field: key, message: "Remove this field; the content API does not keep it" });
  }

  if (document.has("publish_date"))
    errors.push({
      field: "publish_date",
      message: "Remove this field; a page is dated when it first goes public",
    });

  const title = text("title") ?? "";

  if (!title) errors.push({ field: "title", message: "Enter a title" });
  else if (title.length > 300)
    errors.push({ field: "title", message: "Enter a title of 300 characters or fewer" });

  const url = text("url") ?? "";
  const badUrl = url ? urlProblem(url) : "Enter a path";

  if (badUrl) errors.push({ field: "url", message: badUrl });

  const formId = text("form_id") ?? null;

  if (formId && formId.length > 100)
    errors.push({ field: "form_id", message: "Enter a form ID of 100 characters or fewer" });

  const visibilityText = text("visibility") || "public";
  const visibility = VISIBILITIES.find((value) => value === visibilityText);

  if (!visibility) errors.push({ field: "visibility", message: "Choose public, preview or draft" });

  const categoryId = categoryOf(document, base, categories, errors);
  const frontmatter: SaveFields["frontmatter"] = {};
  const lede = text("lede");

  if (lede !== undefined) frontmatter.lede = lede;

  for (const key of TEXT_FRONTMATTER) {
    const value = text(key);

    if (value !== undefined) frontmatter[key] = value;
  }

  const featured = document.get("featured");

  if (typeof featured === "boolean") frontmatter.featured = featured;
  else if (featured !== undefined && featured !== null)
    errors.push({ field: "featured", message: "Enter true or false" });

  const keywords = document.get("keywords");

  if (isSeq(keywords)) {
    const words = keywords.items.flatMap((item) =>
      isScalar(item) && typeof item.value === "string" ? [item.value] : [],
    );

    if (words.length === keywords.items.length) frontmatter.keywords = words;
    else errors.push({ field: "keywords", message: "List each keyword as text" });
  } else if (keywords !== undefined && keywords !== null)
    errors.push({ field: "keywords", message: "List each keyword as text" });

  if (errors.length > 0 || !visibility) return { ok: false, errors };

  return {
    ok: true,
    value: {
      url,
      category_id: categoryId,
      title,
      description: text("description") ?? null,
      visibility,
      form_id: formId,
      body_markdown: markdown.slice(yaml?.position?.end.offset ?? 0).trim(),
      frontmatter,
    },
  };
}

function categoryOf(
  document: ReturnType<typeof parseDocument>,
  base: ApiPage,
  categories: readonly TaxonomyCategory[],
  errors: FieldError[],
) {
  const named = document.get("category");
  const listed = document.get("categories");

  const slugs = [
    ...(typeof named === "string" ? [named] : []),
    ...(isSeq(listed)
      ? listed.items.flatMap((item) =>
          isScalar(item) && typeof item.value === "string" ? [item.value] : [],
        )
      : []),
  ];

  const subcategory = document.get("subcategory");

  // The API files a sub-page in its parent's category.
  if (base.parent_id !== null) {
    if (slugs.length > 0 || subcategory !== undefined)
      errors.push({
        field: "category",
        message: "Remove the category; a sub-page is filed with the page above it",
      });

    return null;
  }

  if (slugs.length !== 1) {
    errors.push({
      field: "category",
      message: slugs.length ? "Choose one category" : "Choose a category",
    });

    return null;
  }

  const category = categories.find((entry) => entry.parent_id === null && entry.slug === slugs[0]);

  if (!category) {
    errors.push({ field: "category", message: `There is no category called ${slugs[0]}` });

    return null;
  }

  if (subcategory === undefined || subcategory === null) return category.id;

  const sub = categories.find(
    (entry) => entry.parent_id === category.id && entry.slug === subcategory,
  );

  if (!sub)
    errors.push({ field: "subcategory", message: `${category.title} has no such subcategory` });

  return sub?.id ?? null;
}

/** The categories page details offers: each top-level category with its subcategories. */
export function pickerCategories(categories: readonly TaxonomyCategory[]) {
  return categories.flatMap((category) =>
    category.parent_id === null
      ? [
          {
            slug: category.slug,
            title: category.title,
            subcategories: categories.flatMap((sub) =>
              sub.parent_id === category.id ? [{ slug: sub.slug, title: sub.title }] : [],
            ),
          },
        ]
      : [],
  );
}
