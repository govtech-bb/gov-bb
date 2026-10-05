/**
 * What counts as a recipe's *content* for the freshness rules (#2878): the
 * parsed JSON object with `updatedAt` removed, compared structurally so
 * formatting and key order are not content.
 *
 * Shared by the updatedAt guard (validate-recipe-updated-at.ts: a content
 * change must move the stamp) and the post-merge archive job
 * (archive-merged-drafts.ts: a change that only moved the stamp must not
 * expire a builder draft), so the two can never disagree about what a
 * stamp-only change is.
 */
import { isDeepStrictEqual } from "node:util";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The recipe minus its `updatedAt`. */
export function recipeContent(
  recipe: Record<string, unknown>,
): Record<string, unknown> {
  const { updatedAt: _stamp, ...content } = recipe;
  return content;
}

/**
 * True when both serialisations parse to JSON objects with the same content —
 * the change between them, if any, is confined to `updatedAt`. False when
 * either does not parse to an object, so a caller treats an unreadable file
 * as a real change.
 */
export function sameRecipeContent(before: string, after: string): boolean {
  let prev: unknown;
  let next: unknown;
  try {
    prev = JSON.parse(before);
    next = JSON.parse(after);
  } catch {
    return false;
  }
  return (
    isRecord(prev) &&
    isRecord(next) &&
    isDeepStrictEqual(recipeContent(prev), recipeContent(next))
  );
}
