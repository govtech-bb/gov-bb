// The hard-failure contract govbb-chatbot's RAG ingest applies to this corpus.
//
// chat.sandbox.alpha.gov.bb is served by govtech-bb/govbb-chatbot, whose
// ingest fetches gov-bb `main` per run and reads THIS directory
// (apps/landing/src/content) with its own raw parser
// (govbb-chatbot/src/lib/rag/content.ts → loadContentDir / splitFrontmatter).
// This test fails gov-bb CI when a content change here would HARD-FAIL that
// ingest, so the break surfaces at PR time instead of 15 min after merge.
//
// Faithful to the parser's real failure surface (verified against content.ts
// and types.ts): the ONLY per-file hard failure is a `---` frontmatter block
// whose YAML does not parse. A missing fence (body = whole text), non-mapping
// frontmatter (meta = {}), and an empty body (page skipped) are all tolerated
// by the parser, so they are NOT flagged here. The corpus-level hard failure
// is an empty/moved directory (corpus-source.ts throws when zero .md pages
// resolve). Keep this minimal; if it grows, promote to a shared package.
// Design: docs/superpowers/specs/2026-08-04-sandbox-chat-ingest-drift-design.md
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

/**
 * Apply the ingest hard-failure contract to one file's raw text. `[]` = passes.
 * Mirrors govbb-chatbot splitFrontmatter: only a present-but-unparseable
 * frontmatter block fails; everything else is tolerated.
 */
export function checkIngestDoc(raw: string, file: string): IngestViolation[] {
  const match = FRONTMATTER.exec(raw)
  if (!match) return []
  try {
    parseYaml(match[1])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [{ file, reason: `invalid frontmatter YAML: ${message}` }]
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
    violations.push(...checkIngestDoc(await readFile(file, 'utf8'), sourceId))
  }
  return violations
}

export async function countMarkdownDocs(dir: string): Promise<number> {
  return (await markdownFiles(dir)).length
}
