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

describe('checkIngestDoc — govbb-chatbot ingest contract', () => {
  it('passes a well-formed page', () => {
    expect(
      checkIngestDoc('---\ntitle: "A"\n---\nBody text.', 'a', 'a'),
    ).toEqual([])
  })

  it('rejects a page with no frontmatter fence', () => {
    const v = checkIngestDoc('just a body, no fence', 'a', 'a')
    expect(v).toHaveLength(1)
    expect(v[0].reason).toMatch(/frontmatter/)
  })

  it('rejects malformed frontmatter YAML', () => {
    const v = checkIngestDoc('---\ntitle: "unterminated\n---\nBody.', 'a', 'a')
    expect(v[0].reason).toMatch(/invalid frontmatter YAML/)
  })

  it('rejects an empty body', () => {
    const v = checkIngestDoc('---\ntitle: A\n---\n   \n', 'a', 'a')
    expect(v[0].reason).toMatch(/empty body/)
  })

  it('falls back to the slug when frontmatter title is absent', () => {
    expect(checkIngestDoc('---\ncategory: x\n---\nBody.', 'a', 'a')).toEqual([])
  })
})

describe('collectIngestViolations — fixture dir', () => {
  it('names the offending file and passes the good one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'corpus-'))
    try {
      await writeFile(join(dir, 'good.md'), '---\ntitle: Good\n---\nHello.')
      await writeFile(join(dir, 'bad.md'), 'no frontmatter here')
      const v = await collectIngestViolations(dir)
      expect(v).toHaveLength(1)
      expect(v[0].file).toBe('bad')
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

  it('is non-empty at the expected path (guards a corpus move/wipe)', async () => {
    expect(await countMarkdownDocs(CORPUS_DIR)).toBeGreaterThanOrEqual(50)
  })
})
