import { describe, expect, it } from 'vitest'
import {
  buildOrganizationLd,
  buildGovernmentServiceLd,
  buildBreadcrumbLd,
  jsonLd,
} from './structured-data'
import { SITE_URL } from './site-url'

describe('jsonLd', () => {
  it('cannot close its <script> and still parses back to the value', () => {
    const title = 'Birth </script><script>alert(1)</script> certificate'
    const ld = buildGovernmentServiceLd({ title, url: 'a/b' })

    const out = jsonLd(ld)

    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual(ld)
    expect(JSON.parse(out).name).toBe(title)
  })
})

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

describe('buildGovernmentServiceLd', () => {
  it('maps title/description/url and references the Organization as provider', () => {
    const ld = buildGovernmentServiceLd({
      title: 'Get a copy of a birth certificate',
      description:
        'Apply online to get a certified copy of a birth certificate.',
      url: 'family-birth-relationships/get-birth-certificate',
    })
    expect(ld['@type']).toBe('GovernmentService')
    expect(ld.name).toBe('Get a copy of a birth certificate')
    expect(ld.description).toBe(
      'Apply online to get a certified copy of a birth certificate.',
    )
    expect(ld.provider['@id']).toBe(buildOrganizationLd()['@id'])
    expect(ld.areaServed).toEqual({ '@type': 'Country', name: 'Barbados' })
    expect(ld.url).toBe(
      `${SITE_URL}/family-birth-relationships/get-birth-certificate`,
    )
  })

  it('omits description when the frontmatter has none', () => {
    const ld = buildGovernmentServiceLd({
      title: 'Get a copy of a birth certificate',
      url: 'family-birth-relationships/get-birth-certificate/start',
    })
    expect('description' in ld).toBe(false)
  })
})

describe('buildBreadcrumbLd', () => {
  it('builds a Home → … → page trail with 1-based positions', () => {
    const ld = buildBreadcrumbLd([
      {
        name: 'Family, birth and relationships',
        url: 'family-birth-relationships',
      },
      {
        name: 'Get a copy of a birth certificate',
        url: 'family-birth-relationships/get-birth-certificate',
      },
    ])
    expect(ld['@type']).toBe('BreadcrumbList')

    const items = ld.itemListElement
    expect(items[0]).toMatchObject({
      position: 1,
      name: 'Home',
      item: SITE_URL,
    })
    // Positions are contiguous and 1-based.
    expect(items.map((i) => i.position)).toEqual(items.map((_, idx) => idx + 1))
    // Last item is the current page, by name and full absolute url.
    const last = items[items.length - 1]
    expect(last.name).toBe('Get a copy of a birth certificate')
    expect(last.item).toBe(
      `${SITE_URL}/family-birth-relationships/get-birth-certificate`,
    )
  })

  it('every item carries an absolute url', () => {
    const ld = buildBreadcrumbLd([{ name: 'C', url: 'a/b/c' }])
    expect(ld.itemListElement.every((i) => i.item.startsWith('http'))).toBe(
      true,
    )
  })

  it('returns just Home for an empty breadcrumb trail', () => {
    const ld = buildBreadcrumbLd([])
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    ])
  })
})
