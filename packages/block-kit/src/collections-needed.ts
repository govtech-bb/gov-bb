/**
 * Which collections a page reads, as a pure function.
 *
 * A server-rendered page has to have every record its blocks show before it
 * renders anything, because there is no second pass in the browser to fetch
 * what was missed. So a route loader fetches the document, asks this which
 * collections its blocks read, and fetches those alongside it.
 *
 * It lives in `./document` rather than beside the renderer because answering
 * the question needs only the document format — a loader asking it should not
 * have to load React to do so.
 */

import type { PageDocument } from "./types";

/** Every collection the document reads, each named once, in sorted order. */
export function collectionsFor(doc: PageDocument | null | undefined): string[] {
  if (!doc) return [];
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
  return [...found].sort();
}
