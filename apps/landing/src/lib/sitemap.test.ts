import { describe, expect, it } from 'vitest'
import { buildSitemapXml, collectSitemapEntries } from './sitemap'
import { CATEGORIES } from '../content/categories'
import type { CategoryTreeResult } from './api-v2-categories'

describe('collectSitemapEntries', () => {
  const entries = collectSitemapEntries()

  it('includes the home and services pages', () => {
    const paths = entries.map((e) => e.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/services')
  })

  it('only emits absolute paths and never duplicates one', () => {
    const paths = entries.map((e) => e.path)
    expect(paths.every((p) => p.startsWith('/'))).toBe(true)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('excludes `/start` application entry sub-pages', () => {
    expect(entries.some((e) => e.path.endsWith('/start'))).toBe(false)
  })
})

describe('buildSitemapXml', () => {
  it('wraps entries in a urlset with absolute, priority-tagged locs', () => {
    const xml = buildSitemapXml(
      [
        { path: '/', priority: 1 },
        { path: '/services', priority: 0.9 },
      ],
      'https://alpha.gov.bb',
    )
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml).toContain('<loc>https://alpha.gov.bb/</loc>')
    expect(xml).toContain('<loc>https://alpha.gov.bb/services</loc>')
    expect(xml).toContain('<priority>0.9</priority>')
  })

  it('escapes XML-significant characters in the loc', () => {
    const xml = buildSitemapXml(
      [{ path: '/a&b', priority: 0.5 }],
      'https://alpha.gov.bb',
    )
    expect(xml).toContain('<loc>https://alpha.gov.bb/a&amp;b</loc>')
  })
})

describe('collectSitemapEntries in api_v2 mode', () => {
  const legacy = collectSitemapEntries()
  const staticCategory = '/health-and-emergency-services'

  it('lists api_v2 categories and subcategories instead of the static ones', () => {
    const paths = collectSitemapEntries(undefined, {
      kind: 'found',
      categories: [
        {
          slug: 'new-category',
          url: '/new-category',
          title: 'New',
          description: null,
          subcategories: [
            {
              slug: 'child',
              url: '/new-category/child',
              title: 'Child',
              description: null,
            },
          ],
        },
      ],
    }).map((e) => e.path)

    expect(paths).toContain('/new-category')
    expect(paths).toContain('/new-category/child')
  })

  it.each([
    ['unavailable', { kind: 'unavailable' }],
    ['malformed', { kind: 'malformed' }],
    ['empty', { kind: 'found', categories: [] }],
  ] satisfies Array<[string, CategoryTreeResult]>)(
    'drops only the category entries when the tree is %s',
    (_, tree) => {
      const entries = collectSitemapEntries(undefined, tree)
      const paths = entries.map((e) => e.path)
      // No static category resurrected…
      expect(legacy.map((e) => e.path)).toContain(staticCategory)
      expect(paths).not.toContain(staticCategory)
      // …while home, services, every page and app route stay: only the
      // static category addresses are gone.
      const categoryPaths = new Set(
        CATEGORIES.flatMap((cat) => [
          `/${cat.slug}`,
          ...(cat.subcategories ?? []).map((sub) => `/${cat.slug}/${sub.slug}`),
        ]),
      )

      expect(paths).toEqual(
        legacy.map((e) => e.path).filter((path) => !categoryPaths.has(path)),
      )
    },
  )
})
