import { describe, expect, it } from 'vitest'
import { findPage, isSubPage, PAGES, resolveServiceHref } from './registry'

describe('resolveServiceHref', () => {
  it('rewrites a bare service slug to its category-prefixed URL', () => {
    expect(resolveServiceHref('/apply-for-a-passport')).toBe(
      '/travel-id-citizenship/apply-for-a-passport',
    )
    expect(resolveServiceHref('/register-a-birth')).toBe(
      '/family-birth-relationships/register-a-birth',
    )
    expect(resolveServiceHref('/start-a-business')).toBe(
      '/business-trade/start-a-business',
    )
  })

  it('rewrites slugs the bug report assumed had no equivalent', () => {
    expect(resolveServiceHref('/loud-music-permit')).toBe(
      '/business-trade/loud-music-permit',
    )
    expect(resolveServiceHref('/apply-financial-assistance')).toBe(
      '/money-financial-support/apply-financial-assistance',
    )
  })

  it('leaves an already-canonical path unchanged', () => {
    expect(
      resolveServiceHref('/travel-id-citizenship/apply-for-a-passport'),
    ).toBe('/travel-id-citizenship/apply-for-a-passport')
  })

  it('leaves external, mailto, tel and anchor links unchanged', () => {
    expect(resolveServiceHref('https://example.gov.bb')).toBe(
      'https://example.gov.bb',
    )
    expect(resolveServiceHref('mailto:hi@gov.bb')).toBe('mailto:hi@gov.bb')
    expect(resolveServiceHref('tel:+12465357260')).toBe('tel:+12465357260')
    expect(resolveServiceHref('#section')).toBe('#section')
  })

  it('leaves an unknown slug unchanged rather than guessing', () => {
    expect(resolveServiceHref('/not-a-real-service')).toBe(
      '/not-a-real-service',
    )
  })
})

describe('isSubPage', () => {
  it('flags a service step page whose parent URL is itself a page', () => {
    const start = findPage(
      'money-financial-support/calculate-severance-pay/start',
    )
    expect(start).toBeDefined()
    expect(isSubPage(start!)).toBe(true)
  })

  it('does not flag the parent service page', () => {
    const service = findPage('money-financial-support/calculate-severance-pay')
    expect(service).toBeDefined()
    expect(isSubPage(service!)).toBe(false)
  })

  it('does not flag a page nested only under a subcategory directory', () => {
    const page = PAGES.find((p) => p.url.endsWith('/community-canvas'))
    expect(page).toBeDefined()
    expect(isSubPage(page!)).toBe(false)
  })
})

describe('money-financial-support listing', () => {
  it('lists the severance service once, not its /start step', () => {
    const inCategory = PAGES.filter(
      (p) =>
        p.frontmatter.categories.includes('money-financial-support') &&
        !isSubPage(p),
    )
    const severance = inCategory.filter(
      (p) =>
        p.frontmatter.title ===
        'Find out how much severance payment you are owed',
    )
    expect(severance).toHaveLength(1)
    expect(severance[0].url).toBe(
      'money-financial-support/calculate-severance-pay',
    )
  })
})
