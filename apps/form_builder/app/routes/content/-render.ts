/**
 * Markdown (de)serialization for landing content pages. Kept separate from
 * `-lib.ts` because it pulls in `gray-matter` (a Node/server dependency) — the
 * constants and validators in `-lib` stay client-safe so the editor can import
 * them without bundling a YAML parser.
 */

import matter from "gray-matter";
import {
  isValidSlug,
  isKnownCategory,
  applyStartLink,
  stripStartLinks,
  type StartPageInput,
} from "./-lib";

export interface RenderOptions {
  /**
   * Existing frontmatter to merge *under* the managed fields, so keys this
   * editor doesn't manage (subcategory, featured, source_url, categories…) are
   * preserved when editing an existing page rather than silently dropped.
   */
  baseFrontmatter?: Record<string, unknown>;
  /**
   * Category slugs valid beyond the built-in list — a category being created
   * in the same deploy.
   */
  allowCategories?: string[];
}

/**
 * Renders the full markdown (YAML frontmatter + body) for a start/content page.
 *
 * Managed fields override any same-named keys from `baseFrontmatter`; all other
 * base keys are preserved.
 *
 * The Start button is set from the link type: `form` writes `form_id`
 * frontmatter and a bare `<a data-start-link>`; `slug`/`external` write an
 * `<a data-start-link href="…">` (no form_id). The marker is rewritten in place
 * if the body already has one (preserving inline position) or appended when
 * there's a target — so a plain content page with no target stays untouched.
 */
export function renderStartPageMarkdown(
  input: StartPageInput,
  opts: RenderOptions = {},
): string {
  const category = input.category.trim();
  if (
    category &&
    !isKnownCategory(category) &&
    !opts.allowCategories?.includes(category)
  ) {
    throw new Error(`Unknown landing category: "${category}"`);
  }
  const formId = input.formId.trim();
  const linkType = input.linkType ?? "form";
  if (linkType === "form" && formId && !isValidSlug(formId)) {
    throw new Error(`Invalid formId: "${formId}"`);
  }

  const fm: Record<string, unknown> = { ...opts.baseFrontmatter };
  fm.title = input.title;
  if (input.description?.trim()) fm.description = input.description.trim();
  else delete fm.description;
  if (category) fm.category = category;
  // Only touch subcategory when the caller provides the field: an empty string
  // explicitly clears it, `undefined` leaves any base value untouched.
  if (input.subcategory !== undefined) {
    const sub = input.subcategory.trim();
    if (sub) fm.subcategory = sub;
    else delete fm.subcategory;
  }
  fm.stage = "alpha";
  fm.publish_date = input.publishDate;
  fm.visibility = input.visibility;

  let body: string;
  if (linkType === "none") {
    // No start button: drop the form link and remove any existing marker.
    delete fm.form_id;
    body = stripStartLinks(input.body.trim());
  } else {
    const href = linkType === "form" ? "" : (input.linkHref?.trim() ?? "");
    const hasTarget = linkType === "form" ? !!formId : !!href;
    if (linkType === "form" && formId) fm.form_id = formId;
    else delete fm.form_id;
    body = applyStartLink(input.body.trim(), {
      href,
      label: input.buttonLabel.trim() || "Start now",
      hasTarget,
    });
  }

  return matter.stringify(`${body}\n`, fm);
}

/** Split a markdown file into its frontmatter object and body. */
export function parseContentMarkdown(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const { data, content } = matter(raw);
  return { frontmatter: data as Record<string, unknown>, body: content.trim() };
}
