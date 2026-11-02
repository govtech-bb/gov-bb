import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const directory = new URL('.', import.meta.url)
const pages = readdirSync(directory, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.md'))
  .sort()

describe('landing content has no HTML comments (#3312)', () => {
  it('finds the Markdown estate', () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it.each(pages)('%s', (path) => {
    expect(
      readFileSync(new URL(path, directory), 'utf8'),
      'Move editorial notes to an issue; HTML comments make pages read-only in editor_v2.',
    ).not.toContain('<!--')
  })
})
