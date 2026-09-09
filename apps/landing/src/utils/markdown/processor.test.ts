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

  it('sanitizes non-allowlisted link protocols to empty', async () => {
    const { hast } = await processMarkdown('[x](javascript:alert(1))')
    expect(elements(hast, 'a').map((a) => a.properties.href)).toEqual([''])
  })

  it('leaves safe, relative and in-page urls untouched', async () => {
    const { hast } = await processMarkdown(
      '[site](https://gov.bb) [page](/services) [mail](mailto:a@b.com) [call](tel:+12465351000)',
    )
    expect(elements(hast, 'a').map((a) => a.properties.href)).toEqual([
      'https://gov.bb',
      '/services',
      'mailto:a@b.com',
      'tel:+12465351000',
    ])
  })

  it('keeps clock times as prose instead of treating them as components', async () => {
    const { hast } = await processMarkdown('Open from 8:30am to 4:30pm.')
    expect(hast).toMatchObject({
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Open from 8:30am to 4:30pm.' }],
        },
      ],
    })
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

  it('compiles the curated component directives', async () => {
    const { hast } = await processMarkdown(
      ':::notice\nApply by **Friday**.\n:::\n\n:::actions\n::action[Start]{href="/start"}\n::action[Guidance]{href="/guide" variant="secondary"}\n:::\n\n:::details{summary="What you need"}\nBring identification.\n:::',
    )

    expect(elements(hast, 'notice')).toHaveLength(1)
    expect(elements(hast, 'strong')[0]?.children[0]).toMatchObject({
      type: 'text',
      value: 'Friday',
    })
    expect(elements(hast, 'buttons')).toHaveLength(1)
    expect(
      elements(hast, 'link-button').map((node) => node.properties),
    ).toEqual([{ href: '/start' }, { href: '/guide', variant: 'secondary' }])
    expect(elements(hast, 'show-hide')[0]?.properties.summary).toBe(
      'What you need',
    )
  })

  it('rejects invalid component attributes and unsafe action urls', async () => {
    await expect(
      processMarkdown(':::details{label="Wrong"}\nBody\n:::'),
    ).rejects.toThrow('does not support')
    await expect(
      processMarkdown(
        ':::actions\n::action[Bad]{href="javascript:alert(1)"}\n:::',
      ),
    ).rejects.toThrow('safe href')
  })
})
