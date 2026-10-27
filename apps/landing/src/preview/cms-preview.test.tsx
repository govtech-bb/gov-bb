// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import matter from 'gray-matter'
import { MarkdownContent } from '../components/markdown/MarkdownContent'
import { mountCmsPreview, prepareCmsPreview } from './cms-preview'
import type { CmsPreviewDocument } from './cms-preview'

const source = matter(
  readFileSync(
    'src/content/apply-to-be-a-project-protege-mentor/index.md',
    'utf8',
  ),
)
const page: CmsPreviewDocument = {
  frontmatter: source.data,
  body: source.content,
  path: '/work-employment/apply-to-be-a-project-protege-mentor',
  breadcrumbs: [
    { label: 'Home', href: '/' },
    { label: 'Work and employment', href: '/work-employment' },
  ],
}
const disposers: Array<() => void> = []

beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}))

afterEach(async () => {
  await act(async () => {
    for (const dispose of disposers.splice(0)) dispose()
  })
  document.body.replaceChildren()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

async function mount(snapshot = page) {
  const container = document.createElement('div')
  document.body.append(container)
  let preview!: Awaited<ReturnType<typeof mountCmsPreview>>
  await act(async () => {
    preview = await mountCmsPreview(
      container,
      snapshot,
      'https://alpha.gov.bb/',
    )
  })
  disposers.push(preview.dispose)
  return { container, preview }
}

describe('fresh CMS site preview', () => {
  it('uses the normal MarkdownContent markup inside the public page composition', async () => {
    const prepared = await prepareCmsPreview(page)
    const { container } = await mount()
    const expected = renderToStaticMarkup(
      <MarkdownContent
        frontmatter={prepared.frontmatter}
        hast={prepared.hast}
        availableForms={prepared.availableForms}
        hideStartLink={prepared.hideStartLink}
      />,
    )
    const normalized = document.createElement('div')
    normalized.innerHTML = expected
    expect(
      container.querySelector('[data-cms-preview-article]')?.innerHTML,
    ).toBe(normalized.innerHTML)
    expect(container.querySelector('header')).not.toBeNull()
    expect(container.querySelector('main')).not.toBeNull()
    expect(container.querySelector('footer')).not.toBeNull()
    expect(container.textContent).toContain('Was this helpful?')
    expect(container.textContent).toContain('Work and employment')
    expect(container.querySelector('iframe')).toBeNull()
    expect(
      container.querySelector(
        'img[src="https://alpha.gov.bb/images/govbb-crest.svg"]',
      ),
    ).not.toBeNull()
    // The preview has no root route context, so the visibility-gated nav link is omitted.
    expect(
      container.querySelector('header a[href="/about-barbados"]'),
    ).toBeNull()
  })

  it('namespaces navigation IDs separately from the independently bundled CMS', async () => {
    const { container } = await mount()
    const navigation = container.querySelector('header nav')!
    const menu = container.querySelector('header button[aria-controls]')!

    expect(navigation.id).toContain('cms-preview-')
    expect(menu.getAttribute('aria-controls')).toBe(navigation.id)
    expect(document.getElementById(navigation.id)).toBe(navigation)
  })

  it.each([
    { source_url: '' },
    { stage: 'beta' },
    { service_type: 'other' },
    { keywords: [''] },
  ])(
    'renders API-valid metadata without changing the source: %j',
    async (metadata) => {
      const snapshot = {
        ...page,
        frontmatter: { title: 'API page', ...metadata },
        body: 'Supported page content.',
      }
      const original = structuredClone(snapshot.frontmatter)
      const { container } = await mount(snapshot)

      expect(container.querySelector('h1')?.textContent).toBe('API page')
      expect(container.querySelector('.govbb-prose')?.textContent).toBe(
        'Supported page content.',
      )
      expect(container.textContent).not.toContain('View the original source')
      expect(snapshot.frontmatter).toEqual(original)
    },
  )

  it('keeps the complete metadata and normal reader transformations', async () => {
    const { container } = await mount({
      ...page,
      frontmatter: {
        title: 'Service title',
        lede: 'An introduction',
        publish_date: '2026-01-13',
        source_url: 'https://www.gov.bb/original',
      },
      body: '| Name | Contact |\n| --- | --- |\n| Help | (246) 123-4567 |\n',
    })
    expect(container.textContent).toContain('An introduction')
    expect(container.textContent).toContain('Last updated on')
    expect(container.textContent).toContain('View the original source')
    expect(container.querySelector('a[href="tel:+12461234567"]')).not.toBeNull()
  })

  it('never invents a publication date or a deployed form', async () => {
    const input = {
      ...page,
      frontmatter: { title: 'Draft', form_id: 'not-deployed' },
      body: '<a data-start-link>Start now</a>',
    }
    const { container, preview } = await mount(input)
    expect(container.textContent).not.toContain('Last updated on')
    expect(container.textContent).not.toContain('Start now')
    await act(async () => {
      await preview.update({ ...input, formStatus: 'available' })
    })
    expect(container.textContent).toContain('Start now')
    await act(async () => {
      await preview.update({ ...input, formStatus: 'closed' })
    })
    expect(container.textContent).toContain(
      'Applications for this service have closed.',
    )
    expect(container.textContent).not.toContain('Start now')
  })

  it('updates current content without following links or writing feedback state', async () => {
    const { container, preview } = await mount()
    const feedback = container.querySelector<HTMLAnchorElement>(
      'a[href="/feedback"]',
    )!
    expect(
      feedback.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    ).toBe(false)
    expect(sessionStorage.getItem('feedbackReferrer')).toBeNull()
    await act(async () => {
      await preview.update({ ...page, body: 'Unsaved **working** content.' })
    })
    expect(container.querySelector('.govbb-prose')?.textContent).toContain(
      'Unsaved working content.',
    )
  })

  it.each([page.path, `${page.path}/start`, `${page.path}/fees`])(
    'renders entry/start/supporting paths without inventing missing metadata: %s',
    async (path) => {
      const { container } = await mount({
        ...page,
        path,
        frontmatter: {},
        body: '',
      })
      expect(container.querySelector('h1')?.textContent).toBe('Untitled page')
      expect(container.textContent).not.toContain('Last updated on')
      expect(container.querySelector('.govbb-prose')?.textContent).toBe('')
    },
  )

  it('does not follow fragment links into the surrounding CMS', async () => {
    const outside = Object.assign(document.createElement('button'), {
      id: 'cms-private-control',
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    })
    document.body.append(outside)
    const { container } = await mount({
      ...page,
      body: '[Outside](#cms-private-control)',
    })
    container
      .querySelector<HTMLAnchorElement>('a[href="#cms-private-control"]')!
      .click()
    expect(outside.focus).not.toHaveBeenCalled()
    expect(outside.scrollIntoView).not.toHaveBeenCalled()
  })

  it('switches only the three editable regions and restores the normal reader', async () => {
    const { container, preview } = await mount()
    let regions!: ReturnType<typeof preview.setEditing>
    await act(async () => {
      regions = preview.setEditing(true)
    })
    expect(regions?.title.closest('h1')).not.toBeNull()
    expect(regions?.lede.closest('p')).not.toBeNull()
    expect(regions?.body.closest('main')).not.toBeNull()
    expect(container.querySelectorAll('[data-cms-region]').length).toBe(3)
    await act(async () => {
      preview.setEditing(false)
      await preview.update({
        ...page,
        frontmatter: { title: 'Working title', lede: 'Working introduction' },
      })
    })
    expect(container.querySelector('h1')?.textContent).toBe('Working title')
    expect(container.textContent).toContain('Working introduction')
    expect(container.querySelector('[data-cms-region]')).toBeNull()
  })

  it('does not render a pending update after disposal, and disposal is idempotent', async () => {
    const { container, preview } = await mount()
    await act(async () => {
      const pending = preview.update({ ...page, body: 'Late update' })
      preview.dispose()
      preview.dispose()
      await pending
    })
    expect(container.childNodes.length).toBe(0)
  })

  it.each([
    '<script>alert(1)</script>',
    '<svg><set attributeName="href" to="javascript:alert(1)" /></svg>',
    '<img src="x" onerror="alert(1)">',
    '<style>body { display: none }</style>',
    '<iframe src="https://example.com"></iframe>',
  ])('refuses executable or embedded markup: %s', async (body) => {
    await expect(prepareCmsPreview({ ...page, body })).rejects.toThrow(
      'Site preview',
    )
  })

  it('refuses unsafe metadata URLs', async () => {
    await expect(
      prepareCmsPreview({
        ...page,
        frontmatter: { title: 'Unsafe', source_url: 'javascript:alert(1)' },
      }),
    ).rejects.toThrow('Site preview')
  })
})
