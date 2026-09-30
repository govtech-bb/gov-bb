/**
 * Writes `src/seed-data/estate.json` from the live estate.
 *
 * `pnpm --filter @govtech-bb/api-v2 seed-data`
 *
 * The seed is a committed snapshot rather than a read of `apps/landing` at
 * boot, because the running API ships without the landing app's source. Run
 * this again to pick up content changes.
 *
 * - pages: every `.md` under `apps/landing/src/content`, at the url landing's
 *   registry gives it — primary category, then subcategory, then leaf, with
 *   a sub-page such as `<service>/start` hanging off its parent's url and,
 *   when it names none, taking its parent's category. A second category is
 *   dropped: a page has one `category_id`.
 * - categories: `CATEGORY_TAXONOMY`, without the subcategory tree, which the
 *   ERD has no table for.
 * - forms: every recipe in the forms API, with its `meta.visibility`
 *   (`preview` when it sets none, as the forms API defaults it; `maintenance`
 *   is not public, so it becomes `preview`) — the file's value, before any
 *   `service_status` override the forms API applies at runtime — plus a `draft` row for any form_id a page names
 *   that no recipe defines, so the FK holds.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";
import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import type { Frontmatter, Visibility } from "../src/schema";
import type { SeedEstate, SeedPage } from "../src/seed-data";

const root = join(__dirname, "..", "..", "..");
const contentDir = join(root, "apps", "landing", "src", "content");
const recipesDir = join(
  root,
  "apps",
  "api",
  "src",
  "forms",
  "form-definitions",
  "recipes",
);
const target = join(__dirname, "..", "src", "seed-data", "estate.json");

const FRONTMATTER_KEYS = [
  "lede",
  "subcategory",
  "stage",
  "featured",
  "section",
  "service_type",
  "keywords",
  "source_url",
] as const satisfies ReadonlyArray<keyof Frontmatter>;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

const titleFromSlug = (slug: string) => {
  const words = (slug.split("/").pop() ?? slug).replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const parentSlug = (slug: string) =>
  slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : undefined;

const asDate = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? new Date(value).toISOString()
      : null;

interface Parsed {
  path: string;
  ownUrl: string;
  page: Omit<SeedPage, "url">;
}

const parsed: Parsed[] = markdownFiles(contentDir).map((path) => {
  const slug = relative(contentDir, path)
    .replace(/\/index\.md$/, "")
    .replace(/\.md$/, "");
  const { data, content } = matter(readFileSync(path, "utf8"));
  const categories = [
    ...new Set<string>([
      ...(data.category ? [data.category] : []),
      ...(data.categories ?? []),
    ]),
  ];
  const primary = categories[0];
  const subcategory: string | undefined = data.subcategory;

  // landing's `leafFromSlug`: nesting on disk under the category (and
  // subcategory) must not double up in the url.
  let leaf = slug;
  for (const prefix of [`${primary}/${subcategory}/`, `${primary}/`]) {
    if (leaf.startsWith(prefix)) {
      leaf = leaf.slice(prefix.length);
      break;
    }
  }

  const frontmatter: Frontmatter = {};
  for (const key of FRONTMATTER_KEYS) {
    if (data[key] !== undefined)
      Object.assign(frontmatter, { [key]: data[key] });
  }

  return {
    path: slug,
    ownUrl: `/${[primary, subcategory, leaf].filter(Boolean).join("/")}`,
    page: {
      category: primary ?? null,
      title: data.title ?? titleFromSlug(slug),
      description: data.description ?? null,
      visibility: data.visibility ?? "public",
      form_id: data.form_id || null,
      published_at: asDate(data.publish_date),
      body_markdown: content.trim(),
      frontmatter,
    },
  };
});

const bySlug = new Map(parsed.map((page) => [page.path, page]));
const urlOf = (page: Parsed): string => {
  const parent = bySlug.get(parentSlug(page.path) ?? "");
  if (!parent) return page.ownUrl;
  return `${urlOf(parent)}/${page.path.split("/").pop()}`;
};

const categoryOf = (page: Parsed): string | null =>
  page.page.category ??
  (bySlug.has(parentSlug(page.path) ?? "")
    ? categoryOf(bySlug.get(parentSlug(page.path)!)!)
    : null);

const pages: SeedPage[] = parsed
  .map((entry) => ({
    url: urlOf(entry),
    ...entry.page,
    category: categoryOf(entry),
  }))
  .sort((a, b) => a.url.localeCompare(b.url));

const recipeVisibility = (value: unknown): Visibility =>
  value === "public" || value === "draft" ? value : "preview";

const formVisibility = new Map<string, Visibility>(
  readdirSync(recipesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const recipe = JSON.parse(readFileSync(join(recipesDir, name), "utf8"));
      return [
        recipe.formId,
        recipeVisibility(recipe.meta?.visibility),
      ] as const;
    }),
);
for (const page of pages) {
  if (page.form_id && !formVisibility.has(page.form_id)) {
    formVisibility.set(page.form_id, "draft");
  }
}

const estate: SeedEstate = {
  categories: CATEGORY_TAXONOMY.map(({ slug, title, description }) => ({
    slug,
    title,
    description: description ?? null,
  })),
  forms: [...formVisibility]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([form_id, visibility]) => ({ form_id, visibility })),
  pages,
};

writeFileSync(target, `${JSON.stringify(estate, null, 2)}\n`);
// Formatted as lint-staged would, so committing it changes nothing.
execFileSync("pnpm", ["exec", "prettier", "--write", target], { cwd: root });
console.log(
  `Wrote ${pages.length} pages, ${estate.categories.length} categories and ` +
    `${estate.forms.length} forms to ${target}`,
);
