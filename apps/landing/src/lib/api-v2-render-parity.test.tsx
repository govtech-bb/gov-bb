import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type * as ReactRouter from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from '../components/markdown'
import { findPage } from '../content/registry'
import type { ContentPage } from '../content/registry'
import { resolveApiV2Page } from './api-v2-page'
import type { PageResponse } from './api-v2-page'
import type { Frontmatter } from './frontmatter'

/**
 * Every page api_v2 is seeded with must build the same page through
 * `fromApiV2` as landing's static registry builds from its markdown (#3135):
 * the same rendered HTML and the same frontmatter fields. No network: the
 * api_v2 response is built from the seed snapshot and read through
 * `resolveApiV2Page`, so the response schema parses every seeded page.
 *
 * Not covered: hidden Start links. Every response here has
 * `hide_start_links: false` and every seeded `/start` page is public, so
 * both sides render the Start links in full.
 */

// StartLink reads useLocation for analytics; stub it so form CTAs render
// without a router context.
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  useLocation: () => ({ pathname: '/test' }),
}))

/** One page of the seed (`SeedPage` in apps/api_v2/src/seed-data/index.ts). */
interface SeedPage {
  url: string
  /** The page's own category row's slug; `served` turns it into the pair. */
  category: string | null
  visibility: string
  title: string
  description: string | null
  form_id: string | null
  published_at: string | null
  body_markdown: string
  /** Title and description are columns of their own. */
  frontmatter: Omit<PageResponse['frontmatter'], 'title' | 'description'>
}

// Read rather than imported: the snapshot belongs to another app.
const ESTATE: {
  categories: Array<{ slug: string; parent: string | null }>
  pages: SeedPage[]
} = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../api_v2/src/seed-data/estate.json', import.meta.url),
    ),
    'utf8',
  ),
)

/**
 * The page as `GET /pages` returns it (`toPublicPage` in
 * apps/api_v2/src/modules/page-visibility.ts) after seeding: apps/api_v2/
 * src/seed.ts stores `published_at` for a public page only, so a non-public
 * page has none until it goes public. `category`/`subcategory` restate
 * `categoryChain` in apps/api_v2/src/modules/navigation.ts; api_v2's
 * seed.test.ts checks the real mapping against the same snapshot.
 */
function served(page: SeedPage): PageResponse {
  const row = ESTATE.categories.find((c) => c.slug === page.category)
  const [category, subcategory] = row
    ? row.parent
      ? [row.parent, row.slug]
      : [row.slug, null]
    : [null, null]
  return {
    url: page.url,
    frontmatter: {
      ...page.frontmatter,
      title: page.title,
      ...(page.description ? { description: page.description } : {}),
    },
    body_markdown: page.body_markdown,
    form_id: page.form_id,
    hide_start_links: false,
    breadcrumbs: [],
    published_at: page.visibility === 'public' ? page.published_at : null,
    updated_at: '2026-01-01T00:00:00.000Z',
    category,
    subcategory,
  }
}

const FIELDS = [
  'title',
  'description',
  'lede',
  'categories',
  'subcategory',
  'form_id',
  'publish_date',
  'stage',
  'service_type',
] as const satisfies ReadonlyArray<keyof Frontmatter>

type Field = (typeof FIELDS)[number]

/**
 * Differences known today. Each is asserted to STILL differ, so the fix that
 * removes one fails this test until its entry is deleted here.
 */
const KNOWN: Array<{ why: string; field: Field; urls: string[] }> = [
  {
    // A `/start` sub-page names no category, so the static page has `[]` and
    // analytics reports it as 'uncategorised'. api_v2 files it under its
    // parent's category (the database requires one).
    why: '/start sub-pages: parent category vs none',
    field: 'categories',
    urls: [
      'business-trade/sell-goods-services-beach-park/start',
      'family-birth-relationships/get-birth-certificate/start',
      'family-birth-relationships/get-death-certificate/start',
      'family-birth-relationships/get-marriage-certificate/start',
      'money-financial-support/get-a-primary-school-textbook-grant/start',
      'travel-id-citizenship/post-office-redirection-business/start',
      'travel-id-citizenship/post-office-redirection-deceased/start',
      'travel-id-citizenship/post-office-redirection-individual/start',
      'work-employment/apply-for-conductor-licence/start',
      'work-employment/apply-to-be-a-project-protege-mentor/start',
      'work-employment/apply-to-jobstart-plus-programme/start',
      'work-employment/register-for-community-sports-training-programme/start',
    ],
  },
  {
    // The markdown names two categories; a page has one `category_id` (#3242).
    why: '#3242',
    field: 'categories',
    urls: ['money-financial-support/calculate-severance-pay'],
  },
  {
    // `description: ''` in the markdown; api_v2 omits a falsy description.
    // Landing treats '' and undefined alike, so nothing renders differently.
    why: "description '' vs absent",
    field: 'description',
    urls: [
      'travel-id-citizenship/post-office-redirection-business/start',
      'travel-id-citizenship/post-office-redirection-deceased/start',
      'travel-id-citizenship/post-office-redirection-individual/start',
    ],
  },
  {
    // The seed stores `published_at` for public pages only, so a preview or
    // draft page loses its `publish_date` ("Last updated") until it is
    // published, and then gets the publication time instead. Nobody sees this
    // until landing sends the preview token (#2961). Derived rather than
    // listed: it is every non-public seed page with a date.
    why: 'seed drops publish_date for non-public pages',
    field: 'publish_date',
    urls: ESTATE.pages
      .filter((page) => page.visibility !== 'public' && page.published_at)
      .map((page) => page.url.replace(/^\//, '')),
  },
]

/**
 * Seeded pages with no static page: the snapshot predates the About Barbados
 * restructure (#3361). Regenerating it (`pnpm --filter @govtech-bb/api-v2
 * seed-data`, #3136) removes them.
 */
const NO_STATIC_PAGE = [
  'about-barbados/archaeological-history',
  'about-barbados/coat-of-arms',
  'about-barbados/flag-etiquette',
  'about-barbados/national-anthem',
  'about-barbados/national-flower',
  'about-barbados/national-pledge',
]

/** The page's body and chrome as the catch-all route renders it. */
function render(page: ContentPage): string {
  const formId = page.frontmatter.form_id
  return renderToStaticMarkup(
    <MarkdownContent
      hast={page.hast}
      frontmatter={page.frontmatter}
      availableForms={new Set(formId ? [formId] : [])}
    />,
  )
}

const seeded = ESTATE.pages.map((page) => page.url.replace(/^\//, ''))

describe('api_v2 render parity', () => {
  it('lists only seeded pages as known differences', () => {
    const listed = [...KNOWN.flatMap((known) => known.urls), ...NO_STATIC_PAGE]
    expect(listed.filter((url) => !seeded.includes(url))).toEqual([])
  })

  it('lists each difference once and never for a page with no static twin', () => {
    const pairs = KNOWN.flatMap((known) =>
      known.urls.map((url) => `${known.field} ${url}`),
    )
    expect(pairs.length).toBe(new Set(pairs).size)
    const urls = KNOWN.flatMap((known) => known.urls)
    expect(urls.filter((url) => NO_STATIC_PAGE.includes(url))).toEqual([])
  })

  it.each(ESTATE.pages.map((page, i) => [seeded[i], page] as const))(
    '%s',
    async (url, seed) => {
      const twin = findPage(url)
      if (NO_STATIC_PAGE.includes(url)) {
        expect(
          twin,
          `${url} now has a static page: remove it from NO_STATIC_PAGE`,
        ).toBeUndefined()
        return
      }
      expect(
        twin,
        `no static page for ${url}: regenerate the seed with pnpm --filter @govtech-bb/api-v2 seed-data`,
      ).toBeDefined()
      if (!twin) return

      const result = await resolveApiV2Page(
        'http://api.example',
        `/${url}`,
        async () => Response.json(served(seed)),
      )
      if (result.kind !== 'page')
        throw new Error(`no page for ${url}: ${JSON.stringify(result)}`)
      const api = result.page
      const known = KNOWN.filter((entry) => entry.urls.includes(url))
      // The HTML must match apart from the known differences: render the twin
      // with those fields as api_v2 has them.
      const expected = { ...twin.frontmatter }
      for (const { field } of known) {
        Object.assign(expected, { [field]: api.frontmatter[field] })
      }
      expect(render(api)).toBe(render({ ...twin, frontmatter: expected }))
      for (const field of FIELDS) {
        const differs = known.find((entry) => entry.field === field)
        if (differs) {
          expect(
            api.frontmatter[field],
            `${field} now matches (${differs.why}): remove ${url} from KNOWN`,
          ).not.toEqual(twin.frontmatter[field])
        } else {
          expect(api.frontmatter[field], field).toEqual(twin.frontmatter[field])
        }
      }
    },
  )
})
