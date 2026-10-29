const HEADING_RE = /^(#{2,6})\s+(.+)$/gm;

/** @deprecated Legacy section shape retained for existing ingestion identities; use MarkdownSection after a planned reindex. */
export interface LegacyMarkdownSection {
  heading?: string;
  headingPath: string[];
  text: string;
}

/** @deprecated Preserves the old raw-heading and preamble rules, including fenced examples; use analyzeContentMarkdown only with an explicit chunk-id migration. */
export function splitLegacyMarkdownSections(
  body: string,
): LegacyMarkdownSection[] {
  const matches = Array.from(body.matchAll(HEADING_RE));
  const first = matches[0];
  if (!first) {
    return body.trim() ? [{ headingPath: [], text: body.trim() }] : [];
  }
  const sections: LegacyMarkdownSection[] = [];
  const preamble = body.slice(0, first.index).trim();
  if (preamble) {
    sections.push({
      heading: "Summary",
      headingPath: ["Summary"],
      text: preamble,
    });
  }
  const stack: Array<{ level: number; text: string }> = [];
  for (const [i, m] of matches.entries()) {
    const level = m[0].search(/\s/);
    const heading = m[0].slice(level).trim();
    while ((stack.at(-1)?.level ?? 0) >= level) stack.pop();
    stack.push({ level, text: heading });
    const start = m.index + m[0].length;
    const end = matches[i + 1]?.index ?? body.length;
    const text = body.slice(start, end).trim();
    if (text) {
      sections.push({ heading, headingPath: stack.map((s) => s.text), text });
    }
  }
  return sections;
}
