import { describe, expect, it } from 'vitest'
import {
  comparePages,
  normalizeTarget,
  snapshot,
  textSimilarity,
} from './compare'

const V2 = 'https://v2.example.com/business-trade/x'
const STATIC = 'https://staging.example.com/business-trade/x'

const page = (main: string, head = '<title>X</title>') =>
  `<html><head>${head}<meta name="description" content="About X"></head>` +
  `<body><header><a href="/elsewhere">Nav</a></header><main>${main}</main></body></html>`

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

const compare = (v2: string, base: string) =>
  comparePages(snapshot(200, null, v2, V2), snapshot(200, null, base, STATIC))

describe('comparePages', () => {
  it('passes markup-only differences', () => {
    const base = page(
      `<h2>How to apply</h2><p>You can <strong>apply</strong> online.</p>` +
        `<a href="/business-trade/x/start">Start now</a>` +
        `<script src="/assets/main-AbC123_d.js"></script>`,
    )
    const v2 = page(
      `<section class="prose">\n  <h2 id="how-to-apply" class="h2">How to\n apply</h2>` +
        `<div><p>You can apply   online.</p></div>` +
        `<a class="button" href="https://v2.example.com/business-trade/x/start/">Start now</a>` +
        `<script src="/assets/main-ZzZ999_q.js"></script></section>`,
    )
    expect(compare(v2, base)).toEqual([])
  })

  it('passes a small wording change below the 2% threshold', () => {
    const text = words(200)
    expect(
      compare(page(`<p>${text} extra</p>`), page(`<p>${text}</p>`)),
    ).toEqual([])
  })

  it('treats sibling apps in other environments as the same link', () => {
    expect(
      compare(
        page('<a href="https://forms.sandbox.alpha.gov.bb/forms/x">Apply</a>'),
        page('<a href="https://forms.staging.alpha.gov.bb/forms/x">Apply</a>'),
      ),
    ).toEqual([])
  })

  it('fails when the main text is less than 98% similar', () => {
    const diffs = compare(
      page(`<p>${words(90)} changed text here now</p>`),
      page(`<p>${words(100)}</p>`),
    )
    expect(diffs).toEqual([
      expect.stringMatching(/^main text 9\d\.\d% similar$/),
    ])
  })

  it('fails on a missing or different heading', () => {
    expect(
      compare(
        page('<h2>Apply</h2><p>a</p>'),
        page('<h2>How to apply</h2><p>a</p>'),
      ).filter((d) => d.startsWith('heading')),
    ).toEqual([
      'heading missing: "How to apply"',
      'heading not in static: "Apply"',
    ])
  })

  it('fails on a missing link target', () => {
    expect(
      compare(
        page('<a href="/a">A</a>'),
        page('<a href="/a">A</a><a href="/b">B</a>'),
      ).filter((d) => d.startsWith('link')),
    ).toEqual(['link missing: "/b"'])
  })

  it('fails on a different status or redirect target and skips the body', () => {
    expect(
      comparePages(
        snapshot(301, '/new', '', V2),
        snapshot(301, 'https://staging.example.com/old', '', STATIC),
      ),
    ).toEqual(['redirect: "/new" ≠ static "/old"'])
    expect(
      comparePages(
        snapshot(200, null, page('a'), V2),
        snapshot(404, null, '', STATIC),
      ),
    ).toEqual(expect.arrayContaining(['status: 200 ≠ static 404']))
  })

  it('fails on a different title or description', () => {
    expect(
      compare(page('a', '<title>Y</title>'), page('a', '<title>X</title>')),
    ).toEqual(['title: "Y" ≠ static "X"'])
  })
})

describe('textSimilarity', () => {
  it('is 1 for equal and 0 for disjoint text', () => {
    expect(textSimilarity('a b c', 'a b c')).toBe(1)
    expect(textSimilarity('', '')).toBe(1)
    expect(textSimilarity('a b', 'c d')).toBe(0)
  })

  it('counts words in common, in order', () => {
    expect(textSimilarity('a b c d', 'a x c d')).toBe(0.75)
  })
})

describe('normalizeTarget', () => {
  it('keeps other sites absolute', () => {
    expect(normalizeTarget('https://gov.uk/x', V2)).toBe('https://gov.uk/x')
  })

  it('only strips hashes from /assets/ files', () => {
    expect(normalizeTarget('/docs/form-abcdefgh.pdf', V2)).toBe(
      '/docs/form-abcdefgh.pdf',
    )
    expect(normalizeTarget('/assets/form-abcdefgh.pdf', V2)).toBe(
      '/assets/form.pdf',
    )
  })
})
