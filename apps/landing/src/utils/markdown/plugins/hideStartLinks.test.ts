import { describe, expect, it } from 'vitest'
import type { Element, Properties, Root, Text } from 'hast'
import rehypeHideStartLinks from './hideStartLinks'

const text = (value: string): Text => ({ type: 'text', value })

const el = (
  tagName: string,
  properties: Properties,
  children: Element['children'] = [],
): Element => ({ type: 'element', tagName, properties, children })

/** Mirrors a "There are 2 ways…" service page: an intro + two method items. */
function buildTree(): Root {
  const onlineMethod = el('li', {}, [
    el('h4', {}, [text('Request a copy online')]),
    el('a', { dataStartLink: true, href: '/x/start' }, [
      text('Complete the online form'),
    ]),
  ])
  const paperMethod = el('li', {}, [el('h4', {}, [text('Get a paper form')])])
  return {
    type: 'root',
    children: [
      el('p', {}, [text('There are 2 ways to get a copy. You can:')]),
      el('ol', {}, [onlineMethod, paperMethod]),
    ],
  }
}

function run(tree: Root, hideStartLink: boolean): Root {
  rehypeHideStartLinks({ hideStartLink })(tree)
  return tree
}

function paragraphText(tree: Root): string {
  const p = tree.children.find(
    (n): n is Element => n.type === 'element' && n.tagName === 'p',
  )
  return (p?.children[0] as Text | undefined)?.value ?? ''
}

function listItemCount(tree: Root): number {
  const ol = tree.children.find(
    (n): n is Element => n.type === 'element' && n.tagName === 'ol',
  )
  return (
    ol?.children.filter((n) => n.type === 'element' && n.tagName === 'li')
      .length ?? 0
  )
}

describe('rehypeHideStartLinks', () => {
  it('removes the online-method item and rewrites the count when hiding', () => {
    const tree = run(buildTree(), true)
    expect(listItemCount(tree)).toBe(1)
    expect(paragraphText(tree)).toBe('There is 1 way to get a copy. You can:')
  })

  it('leaves everything untouched when not hiding', () => {
    const tree = run(buildTree(), false)
    expect(listItemCount(tree)).toBe(2)
    expect(paragraphText(tree)).toBe('There are 2 ways to get a copy. You can:')
  })

  it('rewrites a worded count ("3 ways" → "2 ways") when one is removed', () => {
    const tree: Root = {
      type: 'root',
      children: [
        el('p', {}, [text('There are three ways to apply.')]),
        el('ol', {}, [
          el('li', {}, [el('a', { dataStartLink: true }, [text('online')])]),
          el('li', {}, [text('phone')]),
          el('li', {}, [text('post')]),
        ]),
      ],
    }
    run(tree, true)
    expect(listItemCount(tree)).toBe(2)
    expect(paragraphText(tree)).toBe('There are 2 ways to apply.')
  })

  it('drops a standalone data-start-link anchor not wrapped in a list item', () => {
    const tree: Root = {
      type: 'root',
      children: [
        el('a', { dataStartLink: true, href: '/x/start' }, [text('Start')]),
        el('p', {}, [text('Body')]),
      ],
    }
    run(tree, true)
    const anchors = tree.children.filter(
      (n) => n.type === 'element' && n.tagName === 'a',
    )
    expect(anchors).toHaveLength(0)
  })

  it('leaves ordinary links and list items in place', () => {
    const tree: Root = {
      type: 'root',
      children: [
        el('ol', {}, [
          el('li', {}, [el('a', { href: '/somewhere' }, [text('link')])]),
        ]),
      ],
    }
    run(tree, true)
    expect(listItemCount(tree)).toBe(1)
  })
})
