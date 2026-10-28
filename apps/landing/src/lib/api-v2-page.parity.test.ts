import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findPage } from '../content/registry'
import { fromApiV2 } from './api-v2-page'
import type { PageResponse } from './api-v2-page'

// Every page api_v2 seeds must map to the same ContentPage as its static twin.
const estate = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../api_v2/src/seed-data/estate.json', import.meta.url),
    ),
    'utf8',
  ),
) as {
  categories: Array<{ slug: string; parent: string | null }>
  pages: Array<{
    url: string
    category: string | null
    parent: string | null
    title: string
    description: string | null
    form_id: string | null
    published_at: string | null
    body_markdown: string
    frontmatter: Omit<PageResponse['frontmatter'], 'title' | 'description'>
  }>
}

const strip = (hast: unknown): unknown =>
  JSON.parse(
    JSON.stringify(hast, (key, value) =>
      key === 'position' ? undefined : value,
    ),
  )

describe('api_v2 / static parity', () => {
  it.each(estate.pages.map((page) => [page.url, page] as const))(
    '%s',
    async (_, seed) => {
      const twin = findPage(seed.url)
      expect(
        twin,
        `no static page for ${seed.url}: run pnpm --filter @govtech-bb/api-v2 seed-data`,
      ).toBeDefined()
      if (!twin) return

      const row = estate.categories.find((c) => c.slug === seed.category)
      const [category, subcategory] = row
        ? row.parent
          ? [row.parent, row.slug]
          : [row.slug, null]
        : [null, null]
      const api = await fromApiV2({
        url: seed.url,
        frontmatter: {
          ...seed.frontmatter,
          title: seed.title,
          ...(seed.description && { description: seed.description }),
        },
        body_markdown: seed.body_markdown,
        form_id: seed.form_id,
        hide_start_links: false,
        breadcrumbs: [],
        published_at: seed.published_at,
        updated_at: '2026-01-01T00:00:00.000Z',
        category,
        subcategory,
      })

      expect(api.url).toBe(twin.url)
      expect(api.frontmatter).toEqual({
        ...twin.frontmatter,
        // api_v2 serves landing only public pages; fromApiV2 fixes 'public'
        // (changes under #2961).
        visibility: 'public',
        // A /start sub-page with no category of its own is filed under its
        // parent's: "A sub-page takes its parent's category: the database
        // requires it" (apps/api_v2/scripts/build-seed-data.ts). Otherwise one
        // file names two categories (calculate-severance-pay); the API stores
        // one. #3242 removes the slice.
        categories:
          seed.parent && twin.frontmatter.categories.length === 0
            ? [category]
            : twin.frontmatter.categories.slice(0, 1),
        // Three /start pages carry description: ''; the API omits a falsy
        // description and landing renders '' and undefined alike.
        description: twin.frontmatter.description || undefined,
      })
      expect(strip(api.hast)).toEqual(strip(twin.hast))
    },
  )
})
