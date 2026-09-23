/**
 * Which collections a page needs, as a pure function.
 *
 * It lives outside the React bindings because the server-rendered site asks
 * the same question in a route loader, where there is no React and no hook —
 * it fetches the document, works out which collections its blocks read, and
 * fetches those before rendering anything.
 */

import type { PageDocument } from "@govtech-bb/block-kit/document";

/**
 * Which collections a document needs, as a comma-joined signature.
 *
 * Shared by both backends because both need the same answer and both are
 * sensitive to getting it as a *value* rather than an identity: in the editor
 * the draft is a new object on every keystroke, and keying a subscription on
 * `doc` identity re-subscribed many times a second, which deadlocked PGlite's
 * single worker connection and made `save()` hang with nothing logged.
 */
export const SEPARATOR = ",";

export function collectionSignature(
  doc: PageDocument | null | undefined,
): string {
  if (!doc) return "";
  const found = new Set<string>();
  for (const block of doc.body.blocks) {
    if (block.type === "finder") {
      found.add(block.collection);
      for (const facet of block.facets) {
        if (facet.allowed_values_from) found.add(facet.allowed_values_from);
      }
    }
    if (block.type === "calendar") found.add(block.collection);
    // A contact block names its collection directly, like a finder and a
    // calendar. Before it did, it was reached through a `record` ref and
    // picked up by the loop below — so moving it off refs would have quietly
    // stopped its data loading and left every contact block claiming its
    // record was missing.
    if (block.type === "contact") found.add(block.collection);
  }
  for (const ref of Object.values(doc.body.refs)) {
    if (ref.kind === "record" || ref.kind === "query")
      found.add(ref.collection);
  }
  return [...found].sort().join(SEPARATOR);
}

/** The same answer as a list, which is what a loader actually wants. */
export function collectionsFor(doc: PageDocument | null | undefined): string[] {
  const signature = collectionSignature(doc);
  return signature === "" ? [] : signature.split(SEPARATOR);
}
