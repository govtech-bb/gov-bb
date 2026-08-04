// The raw contract govbb-chatbot's RAG ingest applies to this corpus.
//
// chat.sandbox.alpha.gov.bb is served by govtech-bb/govbb-chatbot, whose
// ingest fetches gov-bb `main` per run and reads THIS directory
// (apps/landing/src/content) with its own raw parser
// (govbb-chatbot/src/lib/rag/content.ts → loadContentDir). A content change
// here that breaks that parser passes gov-bb CI today and only breaks later,
// in govbb-chatbot's ingest. This mirrors that parser's hard rules so such a
// change fails THIS repo's CI instead. Keep it minimal; if the contract grows,
// promote it to a shared package. Design:
// docs/superpowers/specs/2026-08-04-sandbox-chat-ingest-drift-design.md
import { readdir, readFile } from 'node:fs/promises'
import { join, posix, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'

// Same expression govbb-chatbot uses: frontmatter must open at the file start.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface IngestViolation {
  file: string
  reason: string
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter(
      (e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md',
    )
    .map((e) => join(e.parentPath, e.name))
}

/** Apply the ingest contract to one file's raw text. `[]` = passes. */
export function checkIngestDoc(
  raw: string,
  sourceId: string,
  slug: string,
): IngestViolation[] {
  const file = sourceId
  const match = FRONTMATTER.exec(raw)
  if (!match) {
    return [{ file, reason: 'no --- fenced frontmatter block at file start' }]
  }
  let meta: unknown
  try {
    meta = parseYaml(match[1])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [{ file, reason: `invalid frontmatter YAML: ${message}` }]
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return [{ file, reason: 'frontmatter is not a YAML mapping' }]
  }
  const body = raw.slice(match[0].length).trim()
  if (!body) {
    return [{ file, reason: 'empty body — chat ingest would drop this page' }]
  }
  const title = (meta as Record<string, unknown>).title
  const resolved = typeof title === 'string' && title ? title : slug
  if (!resolved) {
    return [
      {
        file,
        reason: 'no usable title (frontmatter title missing and slug empty)',
      },
    ]
  }
  return []
}

/** Validate every non-README markdown page under `dir` (recursive). */
export async function collectIngestViolations(
  dir: string,
): Promise<IngestViolation[]> {
  const files = await markdownFiles(dir)
  const violations: IngestViolation[] = []
  for (const file of files.sort()) {
    const sourceId = relative(dir, file)
      .split(sep)
      .join(posix.sep)
      .replace(/\.md$/, '')
    const slug = sourceId.replace(/\/index$/, '')
    violations.push(
      ...checkIngestDoc(await readFile(file, 'utf8'), sourceId, slug),
    )
  }
  return violations
}

export async function countMarkdownDocs(dir: string): Promise<number> {
  return (await markdownFiles(dir)).length
}
