import { describe, expect, it } from 'vitest'
import {
  categoryServices,
  findPage,
  isCategoryVisible,
  isDigitalService,
  isPreview,
  isSubPage,
  isUrlPreview,
  isVisible,
  PAGES,
  resolveIsPreview,
  resolveServiceHref,
  startSubPageInPreview,
} from './registry'
import { CATEGORY_BY_SLUG } from './categories'

describe('resolveServiceHref', () => {
  it('rewrites a bare service slug to its category-prefixed URL', () => {
    expect(resolveServiceHref('/get-a-document-notarised')).toBe(
      '/travel-id-citizenship/get-a-document-notarised',
    )
    expect(resolveServiceHref('/register-a-birth')).toBe(
      '/family-birth-relationships/register-a-birth',
    )
    expect(resolveServiceHref('/loud-music-permit')).toBe(
      '/business-trade/loud-music-permit',
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
      resolveServiceHref('/travel-id-citizenship/get-a-document-notarised'),
    ).toBe('/travel-id-citizenship/get-a-document-notarised')
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

describe('step pages hang off their parent service URL', () => {
  it('resolves a category-less start.md under its parent, not at a bare URL', () => {
    expect(
      findPage('family-birth-relationships/get-death-certificate/start'),
    ).toBeDefined()
    expect(findPage('get-death-certificate/start')).toBeUndefined()
  })

  it('keeps a start step under a service that does declare its own category', () => {
    expect(
      findPage('money-financial-support/calculate-severance-pay/start'),
    ).toBeDefined()
  })
})

describe('isDigitalService', () => {
  it('treats a form service as digital', () => {
    const formService = findPage(
      'family-birth-relationships/get-death-certificate',
    )
    expect(formService).toBeDefined()
    expect(isDigitalService(formService!)).toBe(true)
  })

  it('treats a service_type: digital tool as digital', () => {
    const tool = findPage('bank-holiday-calendar')
    expect(tool).toBeDefined()
    expect(isDigitalService(tool!)).toBe(true)
  })

  it('treats an informational page (no form, no tool) as not digital', () => {
    const info = PAGES.find((p) => p.slug === 'loud-music-permit')
    expect(info).toBeDefined()
    expect(isDigitalService(info!)).toBe(false)
  })
})

describe('resolveIsPreview (ancestor inheritance)', () => {
  // A small synthetic registry: a public service with a preview /start step,
  // and a fully-preview service.
  const visibility: Record<string, 'public' | 'preview'> = {
    'get-birth-certificate': 'public',
    'get-birth-certificate/start': 'preview',
    'fully-hidden': 'preview',
    'fully-hidden/start': 'public',
  }
  const visibilityOf = (slug: string) => visibility[slug]

  it('flags a page whose own visibility is preview', () => {
    expect(resolveIsPreview('fully-hidden', visibilityOf)).toBe(true)
  })

  it('flags a sub-page whose own visibility is preview', () => {
    expect(resolveIsPreview('get-birth-certificate/start', visibilityOf)).toBe(
      true,
    )
  })

  it('inherits preview from an ancestor page even when the sub-page is public', () => {
    expect(resolveIsPreview('fully-hidden/start', visibilityOf)).toBe(true)
  })

  it('leaves a public page with a preview sub-page public', () => {
    expect(resolveIsPreview('get-birth-certificate', visibilityOf)).toBe(false)
  })

  it('treats an unknown slug as public', () => {
    expect(resolveIsPreview('nothing-here', visibilityOf)).toBe(false)
  })
})

describe('visibility helpers over real content', () => {
  it('flags pages gated by visibility: preview and leaves the rest public', () => {
    const previewPages = PAGES.filter(
      (p) => p.frontmatter.visibility === 'preview',
    )
    expect(previewPages.length).toBeGreaterThan(0)
    for (const p of previewPages) expect(isPreview(p)).toBe(true)

    // Public top-level pages (no ancestor that could pull them into preview)
    // stay public.
    const publicTopLevel = PAGES.filter(
      (p) => p.frontmatter.visibility !== 'preview' && !p.slug.includes('/'),
    )
    for (const p of publicTopLevel) expect(isPreview(p)).toBe(false)
  })

  it('isVisible shows any page in preview mode and public pages otherwise', () => {
    const page = findPage('money-financial-support/calculate-severance-pay')!
    expect(isVisible(page, false)).toBe(true)
    expect(isVisible(page, true)).toBe(true)
  })

  it('startSubPageInPreview is false when the /start step is public', () => {
    const service = findPage('money-financial-support/calculate-severance-pay')!
    expect(startSubPageInPreview(service)).toBe(false)
  })

  it('isUrlPreview fails open for an unknown URL', () => {
    expect(isUrlPreview('not-a-real-service')).toBe(false)
  })
})

describe('isCategoryVisible', () => {
  it('hides pensions-and-gratuities for the public (its only service is preview)', () => {
    const pensions = CATEGORY_BY_SLUG['pensions-and-gratuities']
    expect(pensions).toBeDefined()
    expect(isCategoryVisible(pensions, false)).toBe(false)
  })

  it('shows pensions-and-gratuities to a reviewer in preview mode', () => {
    const pensions = CATEGORY_BY_SLUG['pensions-and-gratuities']
    expect(isCategoryVisible(pensions, true)).toBe(true)
  })

  it('shows a category with public services in both modes', () => {
    const family = CATEGORY_BY_SLUG['family-birth-relationships']
    expect(isCategoryVisible(family, false)).toBe(true)
    expect(isCategoryVisible(family, true)).toBe(true)
  })

  it('hides youth-and-community for the public (all its services are preview)', () => {
    const youth = CATEGORY_BY_SLUG['youth-and-community']
    expect(isCategoryVisible(youth, false)).toBe(false)
  })

  it('shows the sub-categorised youth-and-community to a reviewer in preview mode', () => {
    const youth = CATEGORY_BY_SLUG['youth-and-community']
    expect(isCategoryVisible(youth, true)).toBe(true)
  })
})

describe('categoryServices', () => {
  it('lists the severance service once, not its /start step', () => {
    const severance = categoryServices('money-financial-support', false).filter(
      (p) =>
        p.frontmatter.title ===
        'Find out how much severance payment you are owed',
    )
    expect(severance).toHaveLength(1)
    expect(severance[0].url).toBe(
      'money-financial-support/calculate-severance-pay',
    )
  })

  it('lists severance under work-employment too, at the same canonical URL', () => {
    const inWork = categoryServices('work-employment', false).filter(
      (p) => p.slug === 'calculate-severance-pay',
    )
    expect(inWork).toHaveLength(1)
    expect(inWork[0].url).toBe(
      'money-financial-support/calculate-severance-pay',
    )
  })

  it('drops a category whose only service is preview from the public listing', () => {
    expect(categoryServices('pensions-and-gratuities', false)).toHaveLength(0)
    expect(
      categoryServices('pensions-and-gratuities', true).length,
    ).toBeGreaterThan(0)
  })
})
