import { describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { processMarkdown } from '../../utils/markdown/processor'
import { bakeStartLinkFormId } from '@govtech-bb/govbbmarkd/form-links'
import { MarkdownBody } from './MarkdownContent'

async function renderContent(
  source: string,
  formId?: string,
  forms = new Set<string>(),
  hideStartLink = false,
) {
  const { hast } = await processMarkdown(source)
  bakeStartLinkFormId(hast, formId)
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/test'] }),
  })
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <MarkdownBody
        hast={hast}
        availableForms={forms}
        hideStartLink={hideStartLink}
        formId={formId}
      />
    </RouterContextProvider>,
  )
}

describe('GovBB content dialect rendering', () => {
  it('does not suppress an explicit available form when the page-linked form is unavailable', async () => {
    const source =
      '::::actions\n:::action{target="form"}\nLinked form\n:::\n:::action{form="other" variant="secondary"}\nOther form\n:::\n::::'
    const html = await renderContent(
      source,
      'unavailable',
      new Set(['other']),
      true,
    )
    expect(html).toContain('/forms/other')
    expect(html).not.toContain('Linked form')
  })

  it('keeps another form in a shared list item without decrementing the method count', async () => {
    const source =
      'There are 2 ways to apply.\n\n<ul><li><a data-start-link data-form-id="unavailable">Linked form</a><a data-start-link data-form-id="other">Other form</a></li><li>By post</li></ul>'
    const html = await renderContent(
      source,
      'unavailable',
      new Set(['other']),
      true,
    )
    expect(html).toContain('/forms/other')
    expect(html).not.toContain('Linked form')
    expect(html).toContain('There are 2 ways')
  })

  it('does not parse frontmatter from a stored body', async () => {
    const html = await renderContent(
      '---\n\nYou must submit before Friday.\n\n---\n\nApply below.',
    )
    expect(html).toContain('You must submit before Friday.')
    expect(html.match(/<hr\/>/g)).toHaveLength(2)
  })

  it('renders fenced actions as real design-system button groups and links', async () => {
    const html = await renderContent(
      '::::actions\n:::action{href="/apply"}\nApply **now**\n:::\n:::action{href="/guidance" variant="secondary"}\nRead guidance\n:::\n::::',
    )
    expect(html).toContain('govbb-button-group')
    expect(html).toContain('govbb-button--secondary')
    expect(html).toContain('href="/apply"')
    expect(html).toContain('Apply <strong>now</strong>')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<p>Apply')
  })

  it('resolves linked and explicit form actions without losing availability checks or analytics', async () => {
    const source = ':::action{target="form"}\nStart now\n:::'
    const html = await renderContent(source, 'birth', new Set(['birth']))
    expect(html).toContain('/forms/birth')
    expect(html).toContain('data-umami-event="birth-start"')
    expect(await renderContent(source, 'birth')).not.toContain('Start now')
    const explicit = await renderContent(
      ':::action{form="other"}\nApply\n:::',
      'birth',
      new Set(['other']),
    )
    expect(explicit).toContain('/forms/other')
    expect(explicit).not.toContain('/forms/birth')
  })

  it('renders details labels as summaries rather than duplicate body paragraphs', async () => {
    const html = await renderContent(
      ':::details[Accepted identification]\nBring your passport.\n:::',
    )
    expect(html).toContain('govbb-show-hide')
    expect(html).toContain(
      '<summary class="govbb-show-hide__summary">Accepted identification</summary>',
    )
    expect(html.match(/Accepted identification/g)).toHaveLength(1)
  })

  it('renders captioned tables with a named scroll region, correct headers and numeric cells', async () => {
    const html = await renderContent(
      ':::table[Application fees]{row-headers="first" numeric-columns="2"}\n| Service | Fee |\n| --- | ---: |\n| Example | 50 |\n:::',
    )
    expect(html).toContain('govbb-table-container')
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('Application fees</caption>')
    expect(html).toContain('scope="row"')
    expect(html).toContain('govbb-table__cell--numeric')
    expect(html).toContain('govbb-table__header--numeric')
    expect(html).not.toContain('max-md:block')
  })

  it('does not invent row headers when the author has not identified a key column', async () => {
    const html = await renderContent(
      ':::table[Values]\n| A | B |\n| - | - |\n| 1 | 2 |\n:::',
    )
    expect(html).toContain('scope="col"')
    expect(html).not.toContain('scope="row"')
  })

  it('renders summary keys and Markdown values through SummaryList', async () => {
    const html = await renderContent(
      '::::summary-list\n:::summary-item[Fee]\nBBD **50**\n:::\n:::summary-item[Documents]\n- Identification\n- Proof of address\n:::\n::::',
    )
    expect(html).toContain('<dl class="govbb-summary-list">')
    expect(html).toContain('<dt class="govbb-summary-list__key">Fee</dt>')
    expect(html).toContain('BBD <strong>50</strong>')
    expect(html).toContain('<li>Identification</li>')
    expect(html).not.toContain('<summary-item')
  })

  it('reports invalid components instead of publishing incomplete output', async () => {
    await expect(
      renderContent(':::action{href="javascript:alert(1)"}\nRun\n:::'),
    ).rejects.toMatchObject({ code: 'unsafe-url', line: 1 })
    await expect(renderContent(':::service-list\n:::')).rejects.toMatchObject({
      code: 'unsupported-component',
    })
    await expect(
      renderContent(':::details[Help]\nUnclosed'),
    ).rejects.toMatchObject({ code: 'missing-fence' })
  })
})
