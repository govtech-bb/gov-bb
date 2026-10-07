/**
 * The text search indexes: a page body split at its headings, as plain text.
 *
 * `stripMarkdown` is landing's, verbatim (`apps/landing/src/lib/search.ts`),
 * so a client that rejoins a page's chunks indexes exactly the text it did
 * when it read the markdown itself and its ranking does not move.
 * `search-text.test.ts` holds that true for every page in the estate.
 */

export interface SearchChunk {
  /** The heading the chunk sits under; null for text before the first. */
  heading: string | null;
  body: string;
}

/** Markdown as landing indexes it: syntax stripped, whitespace collapsed. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING = /^#{1,6}\s/;

/** Split at ATX headings outside code fences, then strip each part. */
export function chunkMarkdown(markdown: string): SearchChunk[] {
  let current: { heading: string | null; lines: string[] } = {
    heading: null,
    lines: [],
  };
  const sections = [current];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (!inFence && HEADING.test(line)) {
      current = { heading: line, lines: [] };
      sections.push(current);
      continue;
    }
    // An odd number of fences on a line opens or closes a block, pairing
    // them the way stripMarkdown's lazy match does.
    if ((line.match(/```/g)?.length ?? 0) % 2 === 1) inFence = !inFence;
    current.lines.push(line);
  }
  return sections
    .map(({ heading, lines }) => ({
      heading: heading === null ? null : stripMarkdown(heading) || null,
      body: stripMarkdown(lines.join("\n")),
    }))
    .filter((chunk) => chunk.heading !== null || chunk.body !== "");
}
