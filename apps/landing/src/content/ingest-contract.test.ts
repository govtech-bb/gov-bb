import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  checkIngestDoc,
  collectIngestViolations,
  countMarkdownDocs,
} from './ingest-contract'

// The real corpus lives in this same directory.
const CORPUS_DIR = fileURLToPath(new URL('.', import.meta.url))

describe('checkIngestDoc — faithful to govbb-chatbot ingest hard-failures', () => {
  it('passes a well-formed page', () => {
    expect(checkIngestDoc('---\ntitle: "A"\n---\nBody text.', 'a')).toEqual([])
  })

  it('flags malformed frontmatter YAML (the only per-file hard failure)', () => {
    const v = checkIngestDoc('---\ntitle: "unterminated\n---\nBody.', 'a')
    expect(v).toHaveLength(1)
    expect(v[0].reason).toMatch(/invalid frontmatter YAML/)
  })

  it('tolerates a page with no frontmatter fence (parser uses whole text as body)', () => {
    expect(checkIngestDoc('just a body, no fence', 'a')).toEqual([])
  })

  it('tolerates non-mapping frontmatter (parser falls back to {})', () => {
    expect(checkIngestDoc('---\n- one\n- two\n---\nBody.', 'a')).toEqual([])
  })

  it('tolerates an empty body (parser skips the page, does not fail)', () => {
    expect(checkIngestDoc('---\ntitle: A\n---\n   \n', 'a')).toEqual([])
  })
})

describe('collectIngestViolations — fixture dir', () => {
  it('names the file with malformed frontmatter and passes the good one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'corpus-'))
    try {
      await writeFile(join(dir, 'good.md'), '---\ntitle: Good\n---\nHello.')
      await writeFile(
        join(dir, 'bad.md'),
        '---\ntitle: "unterminated\n---\nHi.',
      )
      const v = await collectIngestViolations(dir)
      expect(v).toHaveLength(1)
      expect(v[0].file).toBe('bad')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('tolerates a fence-less page in the corpus dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'corpus-'))
    try {
      await writeFile(join(dir, 'plain.md'), 'no frontmatter, just prose')
      expect(await collectIngestViolations(dir)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('the live landing corpus satisfies the chat ingest contract', () => {
  it('has zero contract violations', async () => {
    const violations = await collectIngestViolations(CORPUS_DIR)
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  it('resolves at the expected path with markdown pages (guards a move/wipe)', async () => {
    // corpus-source.ts throws when the CONTENT_SUBDIR resolves to zero .md
    // pages — mirror exactly that hard-failure boundary.
    expect(await countMarkdownDocs(CORPUS_DIR)).toBeGreaterThanOrEqual(1)
  })
})
