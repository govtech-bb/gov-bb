import { describe, expect, it } from 'vitest'
import { pageHead, seoTags } from './page-head'
import { SITE_URL } from './site-url'

const findMeta = (meta: Array<Record<string, unknown>>, key: string) =>
  meta.find((m) => m.name === key || m.property === key)

describe('seoTags', () => {
  it('emits og/twitter title + description and an absolute og:url', () => {
    const { meta } = seoTags('A title', 'A description', '/services')
    expect(findMeta(meta, 'og:title')).toEqual({
      property: 'og:title',
      content: 'A title',
    })
    expect(findMeta(meta, 'twitter:title')?.content).toBe('A title')
    expect(findMeta(meta, 'og:description')?.content).toBe('A description')
    expect(findMeta(meta, 'og:url')?.content).toBe(`${SITE_URL}/services`)
  })

  it('sets a canonical link to the absolute url', () => {
    const { links } = seoTags('t', 'd', '/family-birth-relationships')
    expect(links).toEqual([
      { rel: 'canonical', href: `${SITE_URL}/family-birth-relationships` },
    ])
  })

  it('omits og/twitter description when none is given', () => {
    const { meta } = seoTags('t', '', '/x')
    expect(findMeta(meta, 'og:description')).toBeUndefined()
    expect(findMeta(meta, 'twitter:description')).toBeUndefined()
  })
})

describe('pageHead', () => {
  it('suffixes the title and sets the description', () => {
    const { meta } = pageHead('Alpha services', 'Browse services')
    expect(findMeta(meta, 'description')?.content).toBe('Browse services')
    expect(meta.find((m) => 'title' in m)).toEqual({
      title: 'Alpha services | Government of Barbados',
    })
  })

  it('adds canonical + og tags when a path is given', () => {
    const head = pageHead('Alpha services', 'Browse services', {
      path: '/services',
    })
    expect(findMeta(head.meta, 'og:url')?.content).toBe(`${SITE_URL}/services`)
    expect(head.links).toEqual([
      { rel: 'canonical', href: `${SITE_URL}/services` },
    ])
  })

  it('omits canonical/og without a path', () => {
    const head = pageHead('T', 'D')
    expect(findMeta(head.meta, 'og:url')).toBeUndefined()
    expect(head.links).toBeUndefined()
  })

  it('emits noindex and no canonical/og for a gated page', () => {
    const head = pageHead('T', 'D', { noindex: true, path: '/secret' })
    expect(findMeta(head.meta, 'robots')?.content).toBe('noindex')
    expect(findMeta(head.meta, 'og:url')).toBeUndefined()
    expect(head.links).toBeUndefined()
  })
})
