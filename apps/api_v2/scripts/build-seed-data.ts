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
 *   category and records the parent; so do the pages landing nests without
 *   nesting their url (`NESTED_WITHOUT_URL`). A second category is dropped:
 *   a page has one `category_id`. `content_slug` is the markdown path
 *   landing's registry keys the page by, `index.md`/`.md` stripped.
 * - feature-route pages: every `-meta.ts` under `apps/landing/src/routes`,
 *   from its `META`, with an empty body.
 * - categories: `CATEGORY_TAXONOMY` in its order, each subcategory a
 *   category with a parent.
 *
 * No `source` field: every content change would rewrite that one line, so
 * any two open content PRs would conflict on it. The import derives its
 * hash from the snapshot instead (`ESTATE_SOURCE`).
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";
import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import type { Frontmatter } from "../src/modules/page";
import type { SeedEstate, SeedPage } from "../src/seed-data";
import { convertStormReadyContacts } from "../src/seed-data/stormready-contacts";

const root = join(__dirname, "..", "..", "..");
const contentDir = join(root, "apps", "landing", "src", "content");
const routesDir = join(root, "apps", "landing", "src", "routes");
const target = join(__dirname, "..", "src", "seed-data", "estate.json");

const FRONTMATTER_KEYS = [
  "lede",
  "stage",
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
      content_slug: slug,
      published_at: asDate(data.publish_date),
      body_markdown:
        slug === "health-and-emergency-services/stormready"
          ? convertStormReadyContacts(content.trim())
          : content.trim(),
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

/**
 * Pages beneath a parent their url does not nest under: landing's
 * `PARENT_PATHS` (`apps/landing/src/lib/breadcrumb-hierarchy.ts`), copied
 * rather than imported so this script does not reach into another app and
 * survives landing deleting it once it reads `parent_id`. Child url → parent.
 */
const NESTED_WITHOUT_URL: Record<string, string> = {
  "/health-and-emergency-services/free-or-subsidised-medication":
    "/health-and-emergency-services/find-an-open-pharmacy",
  "/health-and-emergency-services/prescription-colours":
    "/health-and-emergency-services/find-an-open-pharmacy",
};
const nestedUrls = new Map(Object.entries(NESTED_WITHOUT_URL));

const parentUrlOf = (page: Parsed): string | null => {
  const parent = bySlug.get(parentSlug(page.path) ?? "");
  return parent ? urlOf(parent) : (nestedUrls.get(urlOf(page)) ?? null);
};

/** The fields of landing's `FeatureMeta` a feature-route page uses. */
interface FeatureMeta {
  url: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  keywords?: string[];
  visibility?: SeedPage["visibility"];
}

const featurePages: SeedPage[] = readdirSync(routesDir, {
  recursive: true,
  encoding: "utf8",
})
  .filter((file) => basename(file) === "-meta.ts")
  .sort()
  .map((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- tsx runs this as CommonJS, so no top-level await import()
    const { META }: { META: FeatureMeta } = require(join(routesDir, file));
    return {
      url: `/${META.url}`,
      category: META.subcategory ?? META.category,
      parent: null,
      title: META.title,
      description: META.description,
      visibility: META.visibility ?? "public",
      form_id: null,
      content_slug: META.url,
      published_at: null,
      // Landing renders these pages from their routes, never this body, and
      // chat ingests every body it is served, so none (#3256).
      body_markdown: "",
      frontmatter: META.keywords ? { keywords: META.keywords } : {},
    };
  });

const pages: SeedPage[] = parsed
  .map((entry) => ({
    url: urlOf(entry),
    ...entry.page,
    category: categoryOf(entry),
    parent: parentUrlOf(entry),
  }))
  .concat(featurePages)
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
