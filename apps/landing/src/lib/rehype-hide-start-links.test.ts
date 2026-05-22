// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import rehypeHideStartLinks from './rehype-hide-start-links'

function render(
  markdown: string,
  options: { hideStartLinks?: boolean } = {},
): string {
  return renderToString(
    React.createElement(
      ReactMarkdown,
      {
        rehypePlugins: [rehypeRaw, [rehypeHideStartLinks, options]],
        remarkPlugins: [remarkGfm],
      },
      markdown,
    ),
  )
}

const SAMPLE = `There are 2 ways to apply.

1. #### Online

   Pay online.

   <a href="/some-page/start">Complete the online form</a>

2. #### Paper

   Pick up a form.
`

describe('rehypeHideStartLinks', () => {
  it('is a no-op when hideStartLinks is false', () => {
    const html = render(SAMPLE, { hideStartLinks: false })
    expect(html).toContain('/some-page/start')
    expect(html).toContain('There are 2 ways to apply')
  })

  it('is a no-op when no options are passed', () => {
    const html = render(SAMPLE)
    expect(html).toContain('/some-page/start')
  })

  it('removes the list item containing a /start link', () => {
    const html = render(SAMPLE, { hideStartLinks: true })
    expect(html).not.toContain('/some-page/start')
    expect(html).not.toContain('Complete the online form')
    expect(html).not.toContain('Pay online')
    expect(html).toContain('Pick up a form')
  })

  it('rewrites "There are 2 ways" to "is 1 way" when one item is removed', () => {
    const html = render(SAMPLE, { hideStartLinks: true })
    expect(html).toContain('is 1 way')
    expect(html).not.toContain('2 ways')
  })

  it('handles word-number forms like "There are two ways"', () => {
    const md = `There are two ways to apply.

1. <a href="/page/start">Start</a>
2. Paper.
`
    const html = render(md, { hideStartLinks: true })
    expect(html).toContain('is 1 way')
  })

  it('removes a standalone /start anchor not inside a list item', () => {
    const md = `<a href="/page/start">Complete the online form</a>`
    const html = render(md, { hideStartLinks: true })
    expect(html).not.toContain('/start')
    expect(html).not.toContain('Complete the online form')
  })

  it('leaves non-start anchors alone', () => {
    const md = `<a href="/other-page">Other</a>`
    const html = render(md, { hideStartLinks: true })
    expect(html).toContain('/other-page')
  })
})
