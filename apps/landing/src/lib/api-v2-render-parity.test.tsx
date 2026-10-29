import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type * as ReactRouter from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from '../components/markdown'
import { findPage } from '../content/registry'
import type { ContentPage } from '../content/registry'
import { fromApiV2 } from './api-v2-page'
import type { PageResponse } from './api-v2-page'
import type { Frontmatter } from './frontmatter'

/**
 * Every page api_v2 is seeded with must build the same page through
 * `fromApiV2` as landing's static registry builds from its markdown (#3135):
 * the same rendered HTML and the same frontmatter fields. No network: the
 * api_v2 response is built from the seed snapshot.
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
  title: string
  description: string | null
  form_id: string | null
  published_at: string | null
  body_markdown: string
  frontmatter: PageResponse['frontmatter']
}

// Read rather than imported: the snapshot belongs to another app.
const ESTATE: { pages: SeedPage[] } = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../api_v2/src/seed-data/estate.json', import.meta.url),
    ),
    'utf8',
  ),
)

/**
 * The page as `GET /pages` returns it (`toPublicPage` in
 * apps/api_v2/src/modules/page-visibility.ts). `published_at` is the
 * snapshot's `publish_date`, which is what the seed stores for a public page.
 */
function served(page: SeedPage): PageResponse {
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
    published_at: page.published_at,
    updated_at: '2026-01-01T00:00:00.000Z',
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
    // #3133: fromApiV2 sets `categories` to the url's first segment.
    why: '#3133',
    field: 'categories',
    urls: ['terms-conditions', 'what-we-mean-by-alpha', 'whats-changing'],
  },
  {
    // #3133: fromApiV2 never sets `subcategory`.
    why: '#3133',
    field: 'subcategory',
    urls: [
      'youth-and-community/arts-culture/community-canvas',
      'youth-and-community/arts-culture/yar',
      'youth-and-community/children-families-community/barbados-blooming-libraries',
      'youth-and-community/children-families-community/ceep',
      'youth-and-community/children-families-community/centre-access',
      'youth-and-community/children-families-community/cmc',
      'youth-and-community/children-families-community/mission-barbados',
      'youth-and-community/children-families-community/national-summer-camp',
      'youth-and-community/entrepreneurship-business/yes',
      'youth-and-community/skills-trades-vocational-training/btu',
      'youth-and-community/skills-trades-vocational-training/cap',
      'youth-and-community/skills-trades-vocational-training/cip',
      'youth-and-community/skills-trades-vocational-training/cyber-security-training',
      'youth-and-community/skills-trades-vocational-training/web-design-entrepreneurs',
      'youth-and-community/youth-development-leadership/bright-sparks-2',
      'youth-and-community/youth-development-leadership/byac',
      'youth-and-community/youth-development-leadership/pathways',
      'youth-and-community/youth-development-leadership/ydp',
    ],
  },
  {
    // A `/start` sub-page names no category, so the static page has `[]` and
    // analytics reports it as 'uncategorised'. fromApiV2 gives it the url's
    // first segment, and api_v2 files it under its parent's category (the
    // database requires one), so #3133's fix keeps the difference.
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

      const api = await fromApiV2(served(seed))
      expect(render(api)).toBe(render(twin))
      for (const field of FIELDS) {
        const known = KNOWN.find(
          (entry) => entry.field === field && entry.urls.includes(url),
        )
        if (known) {
          expect(
            api.frontmatter[field],
            `${field} now matches (${known.why}): remove ${url} from KNOWN`,
          ).not.toEqual(twin.frontmatter[field])
        } else {
          expect(api.frontmatter[field], field).toEqual(twin.frontmatter[field])
        }
      }
    },
  )
})
