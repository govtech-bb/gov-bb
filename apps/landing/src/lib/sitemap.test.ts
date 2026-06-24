import { describe, expect, it } from 'vitest'
import { buildSitemapXml, collectSitemapEntries } from './sitemap'

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
