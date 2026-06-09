import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { processMarkdown } from '../../utils/markdown/processor'
import { bakeStartLinkFormId } from '../../utils/markdown/plugins'
import { PAGES } from '../../content/registry'
import { MarkdownBody } from './MarkdownContent'
import { TableOfContents } from './TableOfContents'

// StartLink reads useLocation for analytics; stub it so form CTAs render
// without a router context.
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useLocation: () => ({ pathname: '/test' }),
}))

async function renderBody(
  md: string,
  opts: { formId?: string; forms?: Set<string>; hideStartLink?: boolean } = {},
): Promise<string> {
  const { hast } = await processMarkdown(md)
  bakeStartLinkFormId(hast, opts.formId)
  return renderToStaticMarkup(
    <MarkdownBody
      hast={hast}
      availableForms={opts.forms}
      hideStartLink={opts.hideStartLink}
    />,
  )
}

describe('MarkdownBody', () => {
  it('linkifies phone numbers in table cells', async () => {
    const html = await renderBody(
      '| Office | Phone |\n| - | - |\n| Registry | (246) 535-1000 |',
    )
    expect(html).toContain('href="tel:+12465351000"')
  })

  it('renders a Start now button when the form is available', async () => {
    const html = await renderBody('<a data-start-link>Start now</a>', {
      formId: 'birth',
      forms: new Set(['birth']),
    })
    expect(html).toContain('Start now')
    expect(html).toContain('/forms/birth')
  })

  it('suppresses the Start button when the form is not available', async () => {
    const html = await renderBody('<a data-start-link>Start now</a>', {
      formId: 'birth',
      forms: new Set(),
    })
    expect(html).not.toContain('Start now')
  })

  it('renders heading ids and appended anchor links', async () => {
    const html = await renderBody('## Apply online')
    expect(html).toContain('id="apply-online"')
    expect(html).toContain('href="#apply-online"')
    expect(html).toContain('anchor-heading')
  })

  it('drops the online method and rewrites the count when hiding start links', async () => {
    const md =
      'There are 2 ways to apply. You can:\n\n- apply online: <a data-start-link href="/x/start">online form</a>\n- apply by post'
    const html = await renderBody(md, { hideStartLink: true })
    expect(html).toContain('is 1 way')
    expect(html).not.toContain('online form')
  })
})

describe('TableOfContents', () => {
  it('lists the h2 sections', () => {
    const html = renderToStaticMarkup(
      <TableOfContents
        headings={[
          { id: 'who-can-apply', text: 'Who can apply', level: 2 },
          { id: 'what-you-need', text: 'What you need', level: 2 },
        ]}
      />,
    )
    expect(html).toContain('Contents')
    expect(html).toContain('href="#who-can-apply"')
    expect(html).toContain('href="#what-you-need"')
  })

  it('renders nothing for fewer than two sections', () => {
    const html = renderToStaticMarkup(
      <TableOfContents headings={[{ id: 'only', text: 'Only', level: 2 }]} />,
    )
    expect(html).toBe('')
  })
})

describe('content corpus', () => {
  it('collected headings for markdown pages at build', () => {
    const markdownPages = PAGES.filter((p) => p.body !== '')
    expect(markdownPages.length).toBeGreaterThan(0)
    for (const page of markdownPages) {
      expect(Array.isArray(page.headings)).toBe(true)
    }
    expect(markdownPages.some((p) => p.headings.length > 0)).toBe(true)
  })
})
