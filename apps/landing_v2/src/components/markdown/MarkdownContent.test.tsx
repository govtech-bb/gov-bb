import { describe, expect, it, vi } from 'vitest'
import type * as ReactRouter from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Root } from 'hast'
import type { PageResponse } from '@govtech-bb/landing-v2-contract'
import { MarkdownBody } from './MarkdownContent'
import indexPageFixture from '../../fixtures/get-birth-certificate.json'
import startPageFixture from '../../fixtures/get-birth-certificate-start.json'

// StartLink reads useLocation for analytics; stub it so form CTAs render
// without a router context.
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  useLocation: () => ({ pathname: '/test' }),
}))

// The JSON's inferred types don't satisfy the contract's hast literal unions
// (e.g. `type: string`); assert once here.
const indexPage = indexPageFixture as PageResponse
const startPage = startPageFixture as PageResponse

function render(hast: Root): string {
  return renderToStaticMarkup(<MarkdownBody hast={hast} />)
}

function headingBlock(html: string, id: string): string {
  const match = html.match(new RegExp(`<h2 id="${id}">.*?</h2>`, 's'))
  if (!match) throw new Error(`heading "${id}" not found in: ${html}`)
  return match[0]
}

describe('MarkdownBody — fixtures', () => {
  it('renders the body inside the govbb-prose wrapper', () => {
    const html = render(indexPage.hast)
    expect(html).toContain('govbb-prose')
  })

  it('keeps the anchor-heading link on a heading, with aria-hidden and tabindex forwarded', () => {
    const html = render(indexPage.hast)
    const block = headingBlock(html, 'how-to-get-a-copy-of-a-birth-certificate')
    expect(block).toContain('aria-hidden="true"')
    expect(block).toContain('tabindex="-1"')
    expect(block).toContain('class="anchor-heading"')
  })

  it('leaves prose tags bare', () => {
    const html = render(indexPage.hast)
    expect(html).toContain('<li>your relationship to them</li>')
    expect(html).toContain(
      '<p>Each certified copy costs $5 BBD. People aged 60 and over pay $1 BBD per certificate.</p>',
    )
  })

  it("renders the index page's start link as a button to the /start page", () => {
    const html = render(indexPage.hast)
    expect(html).toContain(
      'href="/family-birth-relationships/get-birth-certificate/start"',
    )
  })

  it("renders the /start page's start link as a Start-now button to the forms app", () => {
    const html = render(startPage.hast)
    expect(html).toContain(
      'href="https://forms.sandbox.alpha.gov.bb/forms/get-birth-certificate"',
    )
    expect(html).toContain('data-umami-event="get-birth-certificate-start"')
  })

  it('renders fixture content with no console warnings and no [object Object]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = render(indexPage.hast)
    expect(html).not.toContain('[object Object]')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('MarkdownBody — literal hast', () => {
  it('renders tables with the design system components', () => {
    const hast: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'table',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'thead',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'tr',
                  properties: {},
                  children: [
                    {
                      type: 'element',
                      tagName: 'th',
                      properties: { scope: 'col' },
                      children: [{ type: 'text', value: 'Office' }],
                    },
                    {
                      type: 'element',
                      tagName: 'th',
                      properties: { scope: 'col' },
                      children: [{ type: 'text', value: 'Phone' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'element',
              tagName: 'tbody',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'tr',
                  properties: {},
                  children: [
                    {
                      type: 'element',
                      tagName: 'th',
                      properties: { scope: 'row' },
                      children: [{ type: 'text', value: 'Registry' }],
                    },
                    {
                      type: 'element',
                      tagName: 'td',
                      properties: {},
                      children: [{ type: 'text', value: '(246) 535-1000' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const html = render(hast)
    expect(html).toContain('govbb-table')
    expect(html).toContain('govbb-table__header')
    expect(html).toContain('<th class="govbb-table__header" scope="col">')
    expect(html).toContain('<th class="govbb-table__header" scope="row">')
    expect(html).toContain('href="tel:+12465351000"')
  })

  it('renders an inline phone link as a dialable tel: link in the same tab', () => {
    const hast: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            { type: 'text', value: 'Telephone: ' },
            {
              type: 'element',
              tagName: 'a',
              properties: { href: 'tel:+12465363800' },
              children: [{ type: 'text', value: '(246) 536-3800' }],
            },
          ],
        },
      ],
    }

    const html = render(hast)
    expect(html).toContain('href="tel:+12465363800"')
    expect(html).not.toContain('target="_blank"')
  })

  it('renders a notice with its children', () => {
    const hast: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'notice',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'p',
              properties: {},
              children: [{ type: 'text', value: 'Important information.' }],
            },
          ],
        },
      ],
    }

    const html = render(hast)
    expect(html).toContain('Important information.')
  })

  it('renders show-hide as a details/summary', () => {
    const hast: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'show-hide',
          properties: { summary: 'What you need' },
          children: [
            {
              type: 'element',
              tagName: 'p',
              properties: {},
              children: [{ type: 'text', value: 'Bring identification.' }],
            },
          ],
        },
      ],
    }

    const html = render(hast)
    expect(html).toContain('<details class="govbb-show-hide">')
    expect(html).toContain('What you need')
  })

  it('renders a link-button with its href', () => {
    const hast: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'link-button',
          properties: { href: '/next' },
          children: [{ type: 'text', value: 'Continue' }],
        },
      ],
    }

    const html = render(hast)
    expect(html).toContain('href="/next"')
  })

  it('renders nothing for a bare start-link with neither href nor form id', () => {
    const hast: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'a',
          properties: { dataStartLink: '' },
          children: [{ type: 'text', value: 'Start now' }],
        },
      ],
    }

    const html = render(hast)
    expect(html).not.toContain('Start now')
  })
})
