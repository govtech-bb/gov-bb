import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Root } from 'hast'
import { findPage } from '../content/registry'
import { resolveApiV2Page } from './api-v2-page'

// Only the snapshot fields used to construct the wire response; the page reader parses it.
const estate = z
  .object({
    categories: z.array(
      z.object({ slug: z.string(), parent: z.string().nullable() }),
    ),
    pages: z
      .array(
        z.object({
          url: z.string(),
          category: z.string().nullable(),
          parent: z.string().nullable(),
          title: z.string(),
          description: z.string().nullable(),
          form_id: z.string().nullable(),
          published_at: z.string().nullable(),
          body_markdown: z.string(),
          frontmatter: z.record(z.string(), z.unknown()),
        }),
      )
      .min(1),
  })
  .parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../../api_v2/src/seed-data/estate.json', import.meta.url),
        ),
        'utf8',
      ),
    ),
  )

const withoutPositions = (hast: Root): unknown =>
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
      if (!twin) throw new Error(`No static page for ${seed.url}`)

      const row = estate.categories.find((c) => c.slug === seed.category)
      const [category, subcategory] = row
        ? row.parent
          ? [row.parent, row.slug]
          : [row.slug, null]
        : [null, null]
      const result = await resolveApiV2Page(
        'http://api.example',
        seed.url,
        async () =>
          Response.json({
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
          }),
      )
      expect(result.kind).toBe('page')
      if (result.kind !== 'page')
        throw new Error(`API page did not resolve: ${seed.url}`)
      const api = result.page

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
          seed.parent &&
          seed.url.endsWith('/start') &&
          twin.frontmatter.categories.length === 0
            ? findPage(seed.parent)?.frontmatter.categories.slice(0, 1)
            : twin.frontmatter.categories.slice(0, 1),
        // Three /start pages carry description: ''; the API omits a falsy
        // description and landing renders '' and undefined alike.
        description: twin.frontmatter.description || undefined,
      })
      expect(withoutPositions(api.hast)).toEqual(withoutPositions(twin.hast))
    },
  )
})
