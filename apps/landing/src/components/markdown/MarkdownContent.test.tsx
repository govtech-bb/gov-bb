import { describe, expect, it, vi } from 'vitest'
import type * as ReactRouter from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { processMarkdown } from '../../utils/markdown/processor'
import { bakeStartLinkFormId } from '../../utils/markdown/plugins'
import { MarkdownBody } from './MarkdownContent'
import type { ContactRecords } from '../../lib/api-v2-collections'

// StartLink reads useLocation for analytics; stub it so form CTAs render
// without a router context.
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
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

  it('renders an inline phone link as a dialable tel: link in the same tab', async () => {
    const html = await renderBody(
      'Telephone: [(246) 536-3800](tel:+12465363800)',
    )
    expect(html).toContain('href="tel:+12465363800"')
    expect(html).not.toContain('target="_blank"')
  })

  it('renders tables with the design system components', async () => {
    const table = await renderBody('| Office | Phone |\n| - | - |\n| a | b |')
    expect(table).toContain('govbb-table')
    expect(table).toContain('govbb-table__header')
    expect(table).toContain('govbb-table__cell')

    expect(table).toMatch(/<th class="govbb-table__header[^"]*" scope="col"/)
    // Each body row's first cell is its header — the pale-blue first column
    // in the Figma pattern, and the label a screen reader reads with each cell.
    expect(table).toMatch(/<th class="govbb-table__header[^"]*" scope="row"/)
  })

  it('labels each body cell with its column so rows can stack on phones', async () => {
    const table = await renderBody(
      '| Office | Phone | Email |\n| - | - | - |\n| Registry | (246) 535-1000 | a@gov.bb |',
    )
    expect(table).toContain('data-label="Phone"')
    expect(table).toContain('data-label="Email"')
    // The row header is the stacked block's title, so it carries no label.
    expect(table).not.toContain('data-label="Office"')
    // Explicit roles keep the table semantics once the rows are display:block.
    expect(table).toContain('role="table"')
    expect(table).toContain('role="cell"')
    expect(table).toContain('role="rowheader"')
  })

  it('renders authored notice, action and details components', async () => {
    const html = await renderBody(
      ':::notice\nImportant information.\n:::\n\n:::actions\n::action[Continue]{href="/next"}\n:::\n\n:::details{summary="What you need"}\nBring identification.\n:::',
    )

    expect(html).toContain('Important information.')
    expect(html).toContain('href="/next"')
    expect(html).toContain('<details class="govbb-show-hide">')
    expect(html).toContain('What you need')
  })

  it('leaves prose tags bare for govbb-prose to style', async () => {
    const html = await renderBody('## Heading\n\ntext\n\n- one\n- two')

    expect(html).toContain('govbb-prose')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<p>text</p>')
    // the heading keeps its autolink anchor; prose gives it scroll-margin
    expect(html).toMatch(/<h2 id="heading">Heading/)
    // the old per-element wrappers are gone: no section divs, no size classes
    expect(html).not.toContain('space-y-s')
    expect(html).not.toContain('govbb-text-')
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

describe('::contact (a record’s contact details, #3185)', () => {
  const md =
    '::contact{collection="contacts" record="barbados-drug-service" fields="phone,email,website,hours"}'
  const contacts = {
    collection: {
      key: 'contacts',
      schema: {
        fields: [
          { key: 'phone', label: 'Telephone' },
          { key: 'email', label: 'Email' },
          { key: 'website', label: 'Website' },
          { key: 'hours', label: 'Opening hours' },
        ],
      },
    },
    records: {
      'barbados-drug-service': {
        phone: '(246) 535-0021',
        email: 'drugservice@health.gov.bb',
        website: 'httpjavascript:alert(1)',
        hours: '8:30am to 4:30pm',
      },
    },
  }

  async function render(records: ContactRecords = {}) {
    const { hast } = await processMarkdown(md)
    return renderToStaticMarkup(
      <MarkdownBody hast={hast} contactRecords={records} />,
    )
  }

  it('shows the chosen details as <contacts> tiles, labelled by the collection', async () => {
    const html = await render({ contacts })
    // The `<contacts>` grid and its teal tile
    expect(html).toContain('class="grid grid-cols-1 gap-s md:grid-cols-3"')
    expect(html).toContain(
      '<a href="tel:2465350021" class="flex flex-col gap-xxs border-teal-80 border-l-4 bg-teal-10 p-s text-current no-underline',
    )
    expect(html).toContain('<span class="font-bold">Telephone</span>')
    expect(html).toContain('href="mailto:drugservice@health.gov.bb"')
    expect(html).toContain('Opening hours')
  })

  it('links only an address that passes the safe-address check', async () => {
    const html = await render({ contacts })
    expect(html).toContain('httpjavascript:alert(1)')
    expect(html).not.toContain('href="httpjavascript')
  })

  it('shows nothing when the record is missing or couldn’t be read', async () => {
    expect(await render({})).toBe('<div class="govbb-prose"></div>')
    expect(await render({ contacts: { ...contacts, records: {} } })).toBe(
      '<div class="govbb-prose"></div>',
    )
  })

  it('refuses an attribute it doesn’t know', async () => {
    await expect(
      processMarkdown(
        '::contact{collection="contacts" record="x" onclick="y"}',
      ),
    ).rejects.toThrow('does not support the “onclick” attribute')
  })
})
