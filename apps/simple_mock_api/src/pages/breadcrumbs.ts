import type { DatabaseSync } from "node:sqlite";
import {
  CATEGORY_BY_SLUG,
  getSubcategory,
} from "@govtech-bb/content/categories";
import type { PageResponse } from "@govtech-bb/landing-v2-contract";

/**
 * Every URL prefix of `pathname`, shortest first. Copy of `breadcrumbPaths`
 * from `apps/landing/src/lib/breadcrumb-hierarchy.ts` without the
 * `PARENT_PATHS` branch (no seeded page uses it).
 */
function breadcrumbPaths(pathname: string): string[] {
  const current = pathname.replace(/^\/+|\/+$/g, "");
  if (!current) return [];

  const segments = current.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

/**
 * Resolve the last segment of `path` to its display title: category title →
 * subcategory title → page title → de-hyphenated segment. Copy of
 * `titleForSegment` from `apps/landing/src/lib/structured-data.ts` (71–77);
 * v1 finds the page title by leaf slug, here it is the page at `path`.
 */
function titleForSegment(db: DatabaseSync, path: string): string {
  const segments = path.split("/");
  const seg = segments.at(-1) ?? "";
  const previousSegment = segments.at(-2);
  const subTitle = previousSegment
    ? getSubcategory(previousSegment, seg)?.title
    : undefined;
  const fallback = seg.replace(/-/g, " ");
  return (
    CATEGORY_BY_SLUG[seg]?.title ?? subTitle ?? pageTitle(db, path) ?? fallback
  );
}

function pageTitle(db: DatabaseSync, url: string): string | undefined {
  const row = db
    .prepare("SELECT frontmatter FROM pages WHERE url = ?")
    .get(url) as { frontmatter: string } | undefined;
  return row ? JSON.parse(row.frontmatter).title : undefined;
}

/**
 * The full trail to `url`, current page included (named by `title`), Home
 * excluded; crumb URLs carry no leading slash.
 */
export function breadcrumbs(
  db: DatabaseSync,
  url: string,
  title: string,
): PageResponse["breadcrumbs"] {
  const paths = breadcrumbPaths(url);
  return paths.map((path, i) => ({
    name: i === paths.length - 1 ? title : titleForSegment(db, path),
    url: path,
  }));
}
