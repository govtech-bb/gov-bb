/**
 * Generates landing-app **start page** content from manual fields authored in
 * the standalone /content route.
 *
 * A landing "service" is a markdown file under `apps/landing/src/content/`. The
 * start page is a self-contained content page: frontmatter (carrying the
 * `form_id` that links it to a published recipe, plus a `category` for IA
 * placement) followed by body copy and a `<a data-start-link>` marker that the
 * landing renderer turns into a cross-app "Start now" button pointing at
 * `/forms/<form_id>`. See apps/landing/README.md → "Start now buttons".
 *
 * This module is pure (no IO) so it can be unit-tested and reused by the
 * publish server function.
 */

import { KEBAB_ID_PATTERN } from "@govtech-bb/form-types";
import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import type { BuilderFormSummary } from "../../types/index";

/**
 * Forms the CMS can link a content page to: every form except a disabled one
 * with no published recipe. `listForms()` returns disabled draft-only and
 * orphan-override rows so the form-builder picker can re-enable them (#1658),
 * but those have no live recipe to point a content page at — so the content
 * screens hide them. A disabled *published* form stays listed (it was before
 * #1658 too); this restores exactly the filter `listForms` used to apply.
 */
export function linkableForms(
  forms: BuilderFormSummary[],
): BuilderFormSummary[] {
  return forms.filter((f) => !f.isDisabled || f.isPublished);
}

/**
 * Top-level landing categories — the canonical taxonomy owned by
 * `@govtech-bb/content` and shared with landing (which renders it). A category
 * created in this CMS is appended back into that source by
 * {@link insertCategoryEntry}, so the offered list and the rendered list can
 * never drift.
 */
export const LANDING_CATEGORIES = CATEGORY_TAXONOMY;

const LANDING_CATEGORY_SLUGS: ReadonlySet<string> = new Set(
  LANDING_CATEGORIES.map((c) => c.slug),
);

/** Whether `slug` is one of the known landing categories. */
export function isKnownCategory(slug: string): boolean {
  return LANDING_CATEGORY_SLUGS.has(slug);
}

/** Subcategories declared by a category, or `[]` if none / unknown. */
export function subcategoriesFor(
  categorySlug: string,
): ReadonlyArray<{ slug: string; title: string }> {
  return (
    LANDING_CATEGORIES.find((c) => c.slug === categorySlug)?.subcategories ?? []
  );
}

export type ViewLevel = "public" | "preview" | "draft";

/**
 * Landing's hierarchical content view levels (`public < preview < draft`),
 * mirrored from `apps/landing/src/lib/frontmatter.ts` (VIEW_LEVELS). A page's
 * `visibility` is the minimum level a viewer must hold to see it: `draft` is
 * hidden even from preview reviewers. Listed most-restrictive first so a newly
 * authored page defaults to the safest gate.
 */
export const VISIBILITY_LEVELS: ReadonlyArray<{
  value: ViewLevel;
  label: string;
}> = [
  { value: "draft", label: "Hidden (draft) — only via the draft link" },
  { value: "preview", label: "Preview — only via the preview link" },
  { value: "public", label: "Live (public)" },
];

/** Short plain-language status word, shared by the home list and the editor. */
export const VISIBILITY_WORD: Record<ViewLevel, string> = {
  draft: "Hidden",
  preview: "Preview",
  public: "Live",
};

/** What the page's "Start" button points at. */
export type StartLinkType = "form" | "slug" | "external" | "none";

export interface StartPageInput {
  /**
   * Links the page to its published recipe when {@link linkType} is `"form"`.
   * Becomes `form_id` frontmatter and a bare `<a data-start-link>`.
   */
  formId: string;
  /** Slug for the content file and URL leaf. Defaults to `formId`. */
  slug: string;
  title: string;
  description?: string;
  /** Must be one of {@link LANDING_CATEGORIES}. */
  category: string;
  /** Optional subcategory slug within the category. */
  subcategory?: string;
  /** Author-written markdown for the page body. */
  body: string;
  /** Label rendered on the Start now button. */
  buttonLabel: string;
  /**
   * Where the Start button points: a published `form`, an internal `slug`
   * (e.g. `/category/page`), or an `external` URL. Defaults to `form`.
   */
  linkType?: StartLinkType;
  /** The href for `slug`/`external` link types (ignored for `form`). */
  linkHref?: string;
  visibility: ViewLevel;
  /** ISO `YYYY-MM-DD`. */
  publishDate: string;
}

/** Frontmatter values are untyped; coerce to a string ("" when absent). */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The kebab-case validator used for slugs (shared with formIds). */
export function isValidSlug(slug: string): boolean {
  return KEBAB_ID_PATTERN.test(slug);
}

/**
 * Repo-relative path the start page is written to. The slug is validated
 * kebab-case before this is ever interpolated into a GitHub path (the
 * unvalidated-interpolation concern behind landing/api issue #293).
 */
export function startPageContentPath(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid start-page slug: "${slug}"`);
  }
  return `apps/landing/src/content/${slug}.md`;
}

/** Public URL the page resolves to, for display in the editor/PR. */
export function startPageUrl(category: string, slug: string): string {
  return category ? `/${category}/${slug}` : `/${slug}`;
}

/** Repo-relative root every editable landing content file lives under. */
export const CONTENT_ROOT = "apps/landing/src/content/";

/** Guard a repo path before it's interpolated into a GitHub write. */
export function isContentPath(path: string): boolean {
  return (
    path.startsWith(CONTENT_ROOT) &&
    path.endsWith(".md") &&
    !path.includes("..")
  );
}

export interface NewCategory {
  slug: string;
  title: string;
  description?: string;
}

function tsString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Insert a category entry into the canonical `packages/content/src/categories.ts`
 * source (the `CATEGORY_TAXONOMY` array landing re-exports). Pure string surgery
 * anchored on the array's closing bracket; returns null when the anchor (or a
 * duplicate check) says it can't be done safely — the caller surfaces that
 * instead of pushing a corrupted file. A broken edit would also fail the build
 * in the PR's CI, so production is never at risk.
 */
export function insertCategoryEntry(
  source: string,
  cat: NewCategory,
): string | null {
  if (source.includes(`slug: "${cat.slug}"`)) return source; // already there
  const anchor = "];\n\nexport const CATEGORY_BY_SLUG";
  const idx = source.indexOf(anchor);
  if (idx === -1) return null;
  const desc = cat.description?.trim();
  const entry =
    `  {\n` +
    `    slug: ${tsString(cat.slug)},\n` +
    `    title: ${tsString(cat.title)},\n` +
    (desc ? `    description: ${tsString(desc)},\n` : "") +
    `  },\n`;
  return source.slice(0, idx) + entry + source.slice(idx);
}

const START_LINK_RE = /<a\s+data-start-link\b([^>]*)>([\s\S]*?)<\/a>/i;

/**
 * The first `<a data-start-link>` in a body, or null. `href` is "" for a
 * form-linked marker (the form_id frontmatter supplies the target downstream).
 */
export function parseStartLink(
  body: string,
): { href: string; label: string } | null {
  const m = START_LINK_RE.exec(body);
  if (!m) return null;
  const hrefM = /href\s*=\s*"([^"]*)"/i.exec(m[1]);
  return { href: hrefM ? hrefM[1] : "", label: m[2].trim() };
}

/** Whether `href` looks like a full external URL (vs an internal slug). */
export function isExternalHref(href: string): boolean {
  return /^[a-z]+:\/\//i.test(href) || href.startsWith("mailto:");
}

function startLinkTag(href: string, label: string): string {
  return `<a data-start-link${href ? ` href="${href}"` : ""}>${label}</a>`;
}

/**
 * Point the page's Start button at `href` ("" = form-linked, no href): rewrites
 * the first existing `<a data-start-link>` in place — preserving its position,
 * which matters for pages whose button sits inline — or appends one when none
 * exists and there is a target. With no target and no existing marker the body
 * is returned untouched (a plain content page).
 */
export function applyStartLink(
  body: string,
  opts: { href: string; label: string; hasTarget: boolean },
): string {
  const tag = startLinkTag(opts.href, opts.label);
  if (START_LINK_RE.test(body)) return body.replace(START_LINK_RE, tag);
  if (opts.hasTarget) return `${body.trim()}\n\n${tag}`;
  return body;
}

/** Remove every start-link marker — the "No start button" choice. */
export function stripStartLinks(body: string): string {
  return body
    .replace(new RegExp(START_LINK_RE.source, "gi"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Place the Start button at a cursor position: removes any existing marker
 * (the button is moved, not duplicated) and inserts `tag` on its own
 * paragraph at `cursor`. A cursor inside an existing marker snaps to its
 * start. Returns the new body and the cursor position just after the tag,
 * so the editor can restore focus there.
 */
export function placeStartLinkAt(
  body: string,
  cursor: number,
  tag: string,
): { body: string; cursor: number } {
  for (const m of body.matchAll(new RegExp(START_LINK_RE.source, "gi"))) {
    const s = m.index ?? 0;
    if (cursor > s && cursor < s + m[0].length) {
      cursor = s;
      break;
    }
  }
  const strip = (t: string) =>
    t.replace(new RegExp(START_LINK_RE.source, "gi"), "");
  const before = strip(body.slice(0, cursor)).replace(/[ \t\n]+$/, "");
  const after = strip(body.slice(cursor)).replace(/^[ \t\n]+/, "");
  const head = before ? `${before}\n\n` : "";
  const tail = after ? `\n\n${after}` : "\n";
  return { body: `${head}${tag}${tail}`, cursor: head.length + tag.length };
}
