import { describe, expect, it } from 'vitest'
import {
  buildOrganizationLd,
  buildWebSiteLd,
  buildGovernmentServiceLd,
  buildBreadcrumbLd,
} from './structured-data'
import { SITE_URL } from './site-url'
import type { ContentPage } from '../content/registry'

// Minimal ContentPage stand-in — the builders only read `url` and `frontmatter`.
const makePage = (
  url: string,
  frontmatter: Partial<ContentPage['frontmatter']> = {},
): ContentPage =>
  ({
    slug: url,
    url,
    frontmatter: { title: 'Untitled', categories: [], ...frontmatter },
    body: '',
    hast: { type: 'root', children: [] },
  }) as ContentPage

describe('buildOrganizationLd', () => {
  it('describes the Government of Barbados with absolute url and logo', () => {
    const ld = buildOrganizationLd()
    expect(ld['@type']).toBe('Organization')
    expect(ld.name).toBe('Government of Barbados')
    expect(ld.url).toBe(SITE_URL)
    expect(ld.logo).toBe(`${SITE_URL}/images/coat-of-arms.png`)
    expect(ld.logo.startsWith('http')).toBe(true)
  })
})

describe('buildWebSiteLd', () => {
  it('includes a SearchAction pointing at /search-results', () => {
    const ld = buildWebSiteLd()
    expect(ld['@type']).toBe('WebSite')
    expect(ld.url).toBe(SITE_URL)
    expect(ld.potentialAction['@type']).toBe('SearchAction')
    expect(ld.potentialAction.target.urlTemplate).toBe(
      `${SITE_URL}/search-results?q={search_term_string}`,
    )
    expect(ld.potentialAction['query-input']).toContain('search_term_string')
  })
})

describe('buildGovernmentServiceLd', () => {
  it('maps frontmatter and references the Organization as provider', () => {
    const page = makePage('health-and-emergency-services/find-a-shelter', {
      title: 'Find a shelter',
      description: 'Locate an emergency shelter near you.',
    })
    const ld = buildGovernmentServiceLd(page)
    expect(ld['@type']).toBe('GovernmentService')
    expect(ld.name).toBe('Find a shelter')
    expect(ld.description).toBe('Locate an emergency shelter near you.')
    expect(ld.provider['@id']).toBe(buildOrganizationLd()['@id'])
    expect(ld.areaServed).toEqual({ '@type': 'Country', name: 'Barbados' })
    expect(ld.url).toBe(
      `${SITE_URL}/health-and-emergency-services/find-a-shelter`,
    )
  })

  it('omits description when the frontmatter has none', () => {
    const ld = buildGovernmentServiceLd(makePage('some-service'))
    expect('description' in ld).toBe(false)
  })
})

describe('buildBreadcrumbLd', () => {
  it('builds a Home → … → page trail with 1-based positions', () => {
    const page = makePage('health-and-emergency-services/find-a-shelter', {
      title: 'Find a shelter',
    })
    const ld = buildBreadcrumbLd(page)
    expect(ld['@type']).toBe('BreadcrumbList')

    const items = ld.itemListElement
    expect(items[0]).toMatchObject({
      position: 1,
      name: 'Home',
      item: SITE_URL,
    })
    // Positions are contiguous and 1-based.
    expect(items.map((i) => i.position)).toEqual(items.map((_, idx) => idx + 1))
    // Last item is the current page, by frontmatter title and full absolute url.
    const last = items[items.length - 1]
    expect(last.name).toBe('Find a shelter')
    expect(last.item).toBe(
      `${SITE_URL}/health-and-emergency-services/find-a-shelter`,
    )
  })

  it('every item carries an absolute url', () => {
    const ld = buildBreadcrumbLd(makePage('a/b/c', { title: 'C' }))
    expect(ld.itemListElement.every((i) => i.item.startsWith('http'))).toBe(
      true,
    )
  })
})
