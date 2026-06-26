import { describe, expect, it } from 'vitest'
import type { Element, Root } from 'hast'
import { processMarkdown } from './processor'

function elements(tree: Root, tagName: string): Array<Element> {
  const out: Array<Element> = []
  const walk = (node: Element | Root): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue
      if (child.tagName === tagName) out.push(child)
      walk(child)
    }
  }
  walk(tree)
  return out
}

describe('processMarkdown', () => {
  it('gives headings an id and an appended anchor link', async () => {
    const { hast } = await processMarkdown('## Apply online')
    const [h2] = elements(hast, 'h2')
    expect(h2.properties.id).toBe('apply-online')
    const anchor = h2.children.find(
      (c): c is Element => c.type === 'element' && c.tagName === 'a',
    )
    expect(anchor?.properties.href).toBe('#apply-online')
    expect(anchor?.properties.className).toContain('anchor-heading')
  })

  it('sanitizes non-allowlisted link protocols to empty (react-markdown parity)', async () => {
    const { hast } = await processMarkdown(
      '[call](tel:+12465351000) [x](javascript:alert(1))',
    )
    expect(elements(hast, 'a').map((a) => a.properties.href)).toEqual(['', ''])
  })

  it('leaves safe, relative and in-page urls untouched', async () => {
    const { hast } = await processMarkdown(
      '[site](https://gov.bb) [page](/services) [mail](mailto:a@b.com)',
    )
    expect(elements(hast, 'a').map((a) => a.properties.href)).toEqual([
      'https://gov.bb',
      '/services',
      'mailto:a@b.com',
    ])
  })

  it('compiles GFM tables and raw HTML', async () => {
    const { hast } = await processMarkdown(
      '| A | B |\n| - | - |\n| 1 | 2 |\n\n<a data-start-link>Start</a>',
    )
    expect(elements(hast, 'table')).toHaveLength(1)
    const startAnchor = elements(hast, 'a').find(
      (a) => a.properties.dataStartLink !== undefined,
    )
    expect(startAnchor).toBeDefined()
  })
})
