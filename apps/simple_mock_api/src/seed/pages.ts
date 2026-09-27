import type { ZodError } from "zod";
import {
  CATEGORY_BY_SLUG,
  getSubcategory,
} from "@govtech-bb/content/categories";
import type { Frontmatter } from "@govtech-bb/landing-v2-contract";
import { FrontmatterSchema, titleFromSlug } from "./frontmatter.js";

/** A `.md` file read from the seed dir, not yet validated or derived. */
export interface SeedFile {
  /** Relative to the seed dir, e.g. `get-birth-certificate/start.md`. */
  path: string;
  raw: Record<string, unknown>;
  body: string;
}

export interface BuiltPage {
  slug: string;
  url: string;
  frontmatter: Frontmatter;
  body: string;
}

/** Copy of `slugFromPath` from `apps/landing/src/content/registry.ts` (39–44). */
function slugFromPath(path: string): string {
  return path
    .replace(/^\.\//, "")
    .replace(/\/index\.(mdx?|tsx)$/, "")
    .replace(/\.(mdx?|tsx)$/, "");
}

/**
 * The slug one level up (`a/b/c` → `a/b`), or undefined at the top level.
 * Copy of `parentSlug` from `apps/landing/src/content/registry.ts` (47–50).
 */
export function parentSlug(slug: string): string | undefined {
  const i = slug.lastIndexOf("/");
  return i === -1 ? undefined : slug.slice(0, i);
}

/** Copy of `leafFromSlug` from `apps/landing/src/content/registry.ts` (57–71). */
function leafFromSlug(
  slug: string,
  category: string | undefined,
  subcategory: string | undefined,
): string {
  if (category && subcategory) {
    const prefix = `${category}/${subcategory}/`;
    if (slug.startsWith(prefix)) return slug.slice(prefix.length);
  }
  if (category) {
    const prefix = `${category}/`;
    if (slug.startsWith(prefix)) return slug.slice(prefix.length);
  }
  return slug;
}

/** Same shape as form_builder_api's `formatZodError` (`"path: message"`, joined by `"; "`). */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
    .join("; ");
}

/**
 * Validate one page's frontmatter and derive its slug and (parent-less) URL.
 * Copy of the frontmatter-parse / category-subcategory-validation / title-fallback /
 * URL-derivation slice of `buildBasePage` from
 * `apps/landing/src/content/registry.ts` (81–140); everything about React
 * components, feature meta and other v1 page kinds is dropped.
 */
function buildPage(
  path: string,
  raw: Record<string, unknown>,
): { slug: string; url: string; frontmatter: Frontmatter } {
  const slug = slugFromPath(path);
  const parsed = FrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid frontmatter in ${slug}: ${formatZodError(parsed.error)}`,
    );
  }
  const data = parsed.data;
  const categories = Array.from(
    new Set([
      ...(data.category ? [data.category] : []),
      ...(data.categories ?? []),
    ]),
  );
  for (const catSlug of categories) {
    if (!CATEGORY_BY_SLUG[catSlug]) {
      throw new Error(
        `Page "${slug}" references unknown category "${catSlug}".`,
      );
    }
  }
  if (data.subcategory) {
    const owningCategory = categories.find((catSlug) =>
      Boolean(getSubcategory(catSlug, data.subcategory!)),
    );
    if (!owningCategory) {
      throw new Error(
        `Page "${slug}" sets subcategory "${data.subcategory}" but none of its categories declare it.`,
      );
    }
  }
  const frontmatter: Frontmatter = {
    title: data.title ?? titleFromSlug(slug),
    description: data.description,
    lede: data.lede,
    categories,
    subcategory: data.subcategory,
    publish_date: data.publish_date?.toISOString(),
    source_url: data.source_url,
    stage: data.stage,
    visibility: data.visibility,
    featured: data.featured,
    section: data.section,
    service_type: data.service_type,
    form_id: data.form_id,
    keywords: data.keywords,
  };
  const primaryCategory = categories[0];
  const leaf = leafFromSlug(slug, primaryCategory, data.subcategory);
  const urlParts = [primaryCategory, data.subcategory, leaf].filter(
    (part): part is string => Boolean(part),
  );
  const url = urlParts.join("/");
  return { slug, url, frontmatter };
}

/**
 * A step page (its parent slug is itself a page, e.g. `<service>/start`) hangs
 * off its parent's URL. Copy of `urlWithParent` from
 * `apps/landing/src/content/registry.ts` (277–283), resolved over this seed's
 * in-memory page set rather than v1's module-level `PAGES`.
 */
function urlWithParent(
  page: BuiltPage,
  pageBySlug: Map<string, BuiltPage>,
): string {
  const parent = parentSlug(page.slug);
  const parentPage = parent ? pageBySlug.get(parent) : undefined;
  if (!parentPage) return page.url;
  const leaf = page.slug.slice(page.slug.lastIndexOf("/") + 1);
  return `${urlWithParent(parentPage, pageBySlug)}/${leaf}`;
}

export function buildPages(files: SeedFile[]): BuiltPage[] {
  const built = files.map(({ path, raw, body }) => ({
    ...buildPage(path, raw),
    body,
  }));
  const pageBySlug = new Map(built.map((page) => [page.slug, page]));
  return built.map((page) => ({
    ...page,
    url: urlWithParent(page, pageBySlug),
  }));
}
