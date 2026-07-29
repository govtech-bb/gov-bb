import { describe, expect, it } from 'vitest'
import { isExcludedPath } from './page-exclusions'

describe('isExcludedPath', () => {
  it('excludes system / non-content routes', () => {
    for (const p of [
      '/sitemap.xml',
      '/robots.txt',
      '/service-unavailable',
      '/javascript-required',
    ]) {
      expect(isExcludedPath(p)).toBe(true)
    }
  })

  it('excludes forms-app URLs and form-flow /start pages', () => {
    expect(isExcludedPath('/forms/get-birth-certificate')).toBe(true)
    expect(
      isExcludedPath('/family-birth-relationships/register-a-birth/start'),
    ).toBe(true)
  })

  it('excludes the interactive-tool route prefixes (owned by the Tools tab)', () => {
    expect(isExcludedPath('/bank-holiday-calendar')).toBe(true)
    expect(
      isExcludedPath(
        '/health-and-emergency-services/find-an-emergency-shelter/find',
      ),
    ).toBe(true)
    expect(
      isExcludedPath('/money-financial-support/calculate-severance-pay/form'),
    ).toBe(true)
  })

  it('does not exclude a normal content page', () => {
    expect(
      isExcludedPath('/family-birth-relationships/get-birth-certificate'),
    ).toBe(false)
  })
})
