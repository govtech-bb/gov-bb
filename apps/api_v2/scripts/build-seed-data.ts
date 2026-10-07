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
 *   registry gives it — primary category, then subcategory, then leaf. A
 *   page is filed under its subcategory when it names one. A sub-page such
 *   as `<service>/start` hangs off its parent's url, takes its parent's
 *   category and records the parent; so do the pages landing nests by
 *   `PARENT_PATHS` without nesting their url. A second category is dropped:
 *   a page has one `category_id`.
 * - categories: `CATEGORY_TAXONOMY` in its order, each subcategory a
 *   category with a parent.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";
import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
// The hierarchy landing hardcodes; once seeded, the database records it.
import { PARENT_PATHS } from "../../landing/src/lib/breadcrumb-hierarchy";
import type { Frontmatter } from "../src/schema";
import type { SeedEstate, SeedPage } from "../src/seed-data";

const root = join(__dirname, "..", "..", "..");
const contentDir = join(root, "apps", "landing", "src", "content");
const target = join(__dirname, "..", "src", "seed-data", "estate.json");

const FRONTMATTER_KEYS = [
  "lede",
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
      category: subcategory ?? primary ?? null,
      parent: null,
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

const nestedUrls = new Map(
  Object.entries(PARENT_PATHS).map(([child, parent]) => [
    `/${child}`,
    `/${parent}`,
  ]),
);

const parentUrlOf = (page: Parsed): string | null => {
  const parent = bySlug.get(parentSlug(page.path) ?? "");
  return parent ? urlOf(parent) : (nestedUrls.get(urlOf(page)) ?? null);
};

const pages: SeedPage[] = parsed
  .map((entry) => ({
    url: urlOf(entry),
    ...entry.page,
    category: categoryOf(entry),
    parent: parentUrlOf(entry),
  }))
  .sort((a, b) => a.url.localeCompare(b.url));

// A sub-page takes its parent's category: the database requires it.
const byUrl = new Map(pages.map((page) => [page.url, page]));
for (const page of pages) {
  let parent = page.parent ? byUrl.get(page.parent) : undefined;
  while (parent?.parent) parent = byUrl.get(parent.parent);
  if (parent) page.category = parent.category;
}

const estate: SeedEstate = {
  categories: CATEGORY_TAXONOMY.flatMap((category, position) => [
    {
      slug: category.slug,
      title: category.title,
      description: category.description ?? null,
      parent: null,
      position,
    },
    ...(category.subcategories ?? []).map((sub, subPosition) => ({
      slug: sub.slug,
      title: sub.title,
      description: sub.description ?? null,
      parent: category.slug,
      position: subPosition,
    })),
  ]),
  pages,
};

writeFileSync(target, `${JSON.stringify(estate, null, 2)}\n`);
// Formatted as lint-staged would, so committing it changes nothing.
execFileSync("pnpm", ["exec", "prettier", "--write", target], { cwd: root });
console.log(
  `Wrote ${pages.length} pages and ${estate.categories.length} categories ` +
    `to ${target}`,
);
