import { analyzeContentMarkdown } from "@govtech-bb/govbbmarkd";

/** The API's stored search projection; chunk identities and indexing stay application-owned. */
export interface SearchChunk {
  /** The heading the chunk sits under; null for text before the first. */
  heading: string | null;
  body: string;
}

/** Projects readable Markdown sections into search rows, including incomplete drafts without publishing them. */
export function chunkMarkdown(markdown: string): SearchChunk[] {
  return analyzeContentMarkdown(markdown, { frontmatter: false }).sections.map(
    (section) => ({
      heading: section.heading?.text ?? null,
      body: section.text,
    }),
  );
}
