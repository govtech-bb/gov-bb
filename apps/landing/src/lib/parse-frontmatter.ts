import { load } from 'js-yaml'

export interface ParsedFrontmatter {
  data: Record<string, unknown>
  content: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Browser-safe replacement for gray-matter's `matter(source)`. Splits a
 * markdown string at the leading `---` fences, parses the YAML block,
 * and returns the data + remaining body. Unlike gray-matter this never
 * touches Node's `Buffer` API, so it works in the client bundle.
 */
export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = source.match(FRONTMATTER_RE)
  if (!match) return { data: {}, content: source }
  const parsed = load(match[1])
  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  return { data, content: match[2] }
}
