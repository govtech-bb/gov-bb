import type { DatabaseSync } from "node:sqlite";
import type { Frontmatter } from "@govtech-bb/landing-v2-contract";
import { parentSlug } from "../seed/pages.js";

export type ViewLevel = Frontmatter["visibility"];

/**
 * Numeric rank of a view level — higher is more restricted / more privileged.
 * Copy of `RANK` from `apps/landing/src/content/registry.ts` (316).
 */
const RANK: Record<ViewLevel, number> = { public: 0, preview: 1, draft: 2 };

/**
 * Walk `slug` and each ancestor slug, returning the highest-ranked level found.
 * `visibilityOf` returns the *own* visibility of a slug, or undefined if no
 * page sits at that slug (intermediate directory). Copy of `resolvePageLevel`
 * from `apps/landing/src/content/registry.ts` (380–392).
 */
export function resolvePageLevel(
  slug: string,
  visibilityOf: (slug: string) => ViewLevel | undefined,
): ViewLevel {
  let effective: ViewLevel = "public";
  let current: string | undefined = slug;
  while (current) {
    const own = visibilityOf(current);
    if (own && RANK[own] > RANK[effective]) effective = own;
    current = parentSlug(current);
  }
  return effective;
}

/** A slug's own visibility, or undefined when no page sits at that slug. */
export function visibilityOf(
  db: DatabaseSync,
): (slug: string) => ViewLevel | undefined {
  const select = db.prepare("SELECT visibility FROM pages WHERE slug = ?");
  return (slug) =>
    (select.get(slug) as { visibility: ViewLevel } | undefined)?.visibility;
}

/**
 * The effective level of this page's `<slug>/start` sub-page, or `public` when
 * there is none. Copy of `startSubPageLevel` from
 * `apps/landing/src/content/registry.ts` (434–440), with the `BY_SLUG` lookup
 * read from the pages table.
 */
export function startSubPageLevel(db: DatabaseSync, slug: string): ViewLevel {
  const own = visibilityOf(db);
  const start = `${slug}/start`;
  return own(start) ? resolvePageLevel(start, own) : "public";
}

/**
 * Whether to strip a page's online-application method (see
 * `hide-start-links.ts`): the viewer cannot see the page's `/start` sub-page,
 * or the page's form is not public. Copy of `shouldHideStartLink` from
 * `apps/landing/src/lib/hide-start-link.ts`, with `formPublic` in place of
 * v1's available-forms list.
 */
export function shouldHideStartLink({
  startSubPageVisible,
  formId,
  formPublic,
}: {
  startSubPageVisible: boolean;
  formId: string | undefined;
  formPublic: boolean;
}): boolean {
  if (!startSubPageVisible) return true;
  return formId !== undefined && !formPublic;
}
