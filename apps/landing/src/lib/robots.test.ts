import { describe, expect, it } from 'vitest'
import { buildRobotsTxt } from './robots'

describe('buildRobotsTxt', () => {
  it('disallows the whole site when indexing is off', () => {
    expect(buildRobotsTxt(false, 'https://alpha.gov.bb')).toBe(
      'User-agent: *\nDisallow: /\n',
    )
  })

  it('allows everything and advertises the sitemap when indexing is on', () => {
    const txt = buildRobotsTxt(true, 'https://alpha.gov.bb')
    expect(txt).toContain('Allow: /')
    expect(txt).toContain('Sitemap: https://alpha.gov.bb/sitemap.xml')
    expect(txt).not.toContain('Disallow: /')
  })
})
