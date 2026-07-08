import { describe, expect, it } from 'vitest'
import {
  categoryServices,
  findPage,
  isCategoryVisible,
  isDigitalService,
  isStartSubPageVisible,
  isSubPage,
  isUrlVisible,
  isVisible,
  PAGES,
  pageLevel,
  resolvePageLevel,
  resolveServiceHref,
  startSubPageLevel,
  urlLevel,
} from './registry'
import { CATEGORY_BY_SLUG } from './categories'
import type { ViewLevel } from '../lib/frontmatter'

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

describe('education pages link their published form (#911 Group A)', () => {
  // Each of these education pages must carry a working "Start now" button: the
  // form_id is baked onto a `data-start-link` anchor with NO authored href (an
  // authored href would win over form_id and point at a non-existent /start
  // sub-page — see bakeStartLinkFormId / StartLink). All three forms are live
  // in the forms API, so the button resolves once the page is visible.
  const expected: Record<string, string> = {
    'education/apply-to-sit-the-bssee-early':
      'bssee-form-a-pupil-under-11-request',
    'education/defer-your-childs-bssee-sitting':
      'bssee-form-b-defer-examination',
    'education/apply-for-secondary-school-entry-for-a-non-national-child':
      'non-nationals-secondary-entry',
  }

  function findStartLink(node: {
    type?: string
    tagName?: string
    properties?: Record<string, unknown>
    children?: unknown[]
  }): { properties?: Record<string, unknown> } | undefined {
    if (
      node.type === 'element' &&
      node.tagName === 'a' &&
      node.properties?.dataStartLink !== undefined
    ) {
      return node
    }
    for (const child of (node.children ?? []) as Array<typeof node>) {
      const hit = findStartLink(child)
      if (hit) return hit
    }
    return undefined
  }

  for (const [url, formId] of Object.entries(expected)) {
    it(`${url} → ${formId}`, () => {
      const page = findPage(url)
      expect(page, `page not found at ${url}`).toBeDefined()
      expect(page!.frontmatter.form_id).toBe(formId)

      const startLink = findStartLink(page!.hast)
      expect(startLink, 'no data-start-link anchor on the page').toBeDefined()
      // No authored href — otherwise the baked form_id is ignored.
      expect(startLink!.properties?.href).toBeUndefined()
      // form_id is baked onto the anchor at build time (registry.ts).
      expect(startLink!.properties?.dataFormId).toBe(formId)
    })
  }
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
    const tool = PAGES.find((p) => p.slug === 'calculate-your-pension')
    expect(tool).toBeDefined()
    expect(isDigitalService(tool!)).toBe(true)
  })

  it('treats an informational page (no form, no tool) as not digital', () => {
    const info = PAGES.find((p) => p.slug === 'loud-music-permit')
    expect(info).toBeDefined()
    expect(isDigitalService(info!)).toBe(false)
  })
})

describe('resolvePageLevel (ancestor inheritance)', () => {
  // A small synthetic registry: a public service with a preview /start step, a
  // fully-preview service, and a draft service whose /start is (nominally)
  // public but should inherit draft from its parent.
  const visibility: Record<string, ViewLevel> = {
    'get-birth-certificate': 'public',
    'get-birth-certificate/start': 'preview',
    'fully-hidden': 'preview',
    'fully-hidden/start': 'public',
    'draft-service': 'draft',
    'draft-service/start': 'public',
  }
  const visibilityOf = (slug: string) => visibility[slug]

  it('returns a page its own level', () => {
    expect(resolvePageLevel('fully-hidden', visibilityOf)).toBe('preview')
    expect(resolvePageLevel('draft-service', visibilityOf)).toBe('draft')
  })

  it('returns a sub-page its own level', () => {
    expect(resolvePageLevel('get-birth-certificate/start', visibilityOf)).toBe(
      'preview',
    )
  })

  it('inherits the most-restricted ancestor level even when the sub-page is public', () => {
    expect(resolvePageLevel('fully-hidden/start', visibilityOf)).toBe('preview')
    expect(resolvePageLevel('draft-service/start', visibilityOf)).toBe('draft')
  })

  it('leaves a public page with a more-restricted sub-page public', () => {
    expect(resolvePageLevel('get-birth-certificate', visibilityOf)).toBe(
      'public',
    )
  })

  it('treats an unknown slug as public', () => {
    expect(resolvePageLevel('nothing-here', visibilityOf)).toBe('public')
  })
})

describe('visibility helpers over real content', () => {
  it('reflects each page-gated level and leaves the rest public', () => {
    const previewPages = PAGES.filter(
      (p) => p.frontmatter.visibility === 'preview',
    )
    expect(previewPages.length).toBeGreaterThan(0)
    for (const p of previewPages) expect(pageLevel(p)).toBe('preview')

    // Public top-level pages (no ancestor that could pull them into a higher
    // level) stay public.
    const publicTopLevel = PAGES.filter(
      (p) => p.frontmatter.visibility === 'public' && !p.slug.includes('/'),
    )
    for (const p of publicTopLevel) expect(pageLevel(p)).toBe('public')
  })

  it('isVisible shows a public page at every level', () => {
    const page = findPage('money-financial-support/calculate-severance-pay')!
    expect(isVisible(page, 'public')).toBe(true)
    expect(isVisible(page, 'preview')).toBe(true)
    expect(isVisible(page, 'draft')).toBe(true)
  })

  it('isVisible gates a preview page below preview level, opening it to preview and draft', () => {
    const previewPage = PAGES.find((p) => pageLevel(p) === 'preview')
    expect(previewPage).toBeDefined()
    // The public cannot see it; preview and the higher draft level both can.
    expect(isVisible(previewPage!, 'public')).toBe(false)
    expect(isVisible(previewPage!, 'preview')).toBe(true)
    expect(isVisible(previewPage!, 'draft')).toBe(true)
  })

  it('startSubPageLevel is public when the /start step is public', () => {
    const service = findPage('money-financial-support/calculate-severance-pay')!
    expect(startSubPageLevel(service)).toBe('public')
    expect(isStartSubPageVisible(service, 'public')).toBe(true)
  })

  it('urlLevel fails open to public for an unknown URL', () => {
    expect(urlLevel('not-a-real-service')).toBe('public')
  })
})

describe('isCategoryVisible', () => {
  it('hides pensions-and-gratuities for the public (its only service is preview)', () => {
    const pensions = CATEGORY_BY_SLUG['pensions-and-gratuities']
    expect(pensions).toBeDefined()
    expect(isCategoryVisible(pensions, 'public')).toBe(false)
  })

  it('shows pensions-and-gratuities to a reviewer at preview level', () => {
    const pensions = CATEGORY_BY_SLUG['pensions-and-gratuities']
    expect(isCategoryVisible(pensions, 'preview')).toBe(true)
  })

  it('shows a category with public services at every level', () => {
    const family = CATEGORY_BY_SLUG['family-birth-relationships']
    expect(isCategoryVisible(family, 'public')).toBe(true)
    expect(isCategoryVisible(family, 'preview')).toBe(true)
    expect(isCategoryVisible(family, 'draft')).toBe(true)
  })

  it('hides youth-and-community for the public (all its services are preview)', () => {
    const youth = CATEGORY_BY_SLUG['youth-and-community']
    expect(isCategoryVisible(youth, 'public')).toBe(false)
  })

  it('shows the sub-categorised youth-and-community to a reviewer at preview level', () => {
    const youth = CATEGORY_BY_SLUG['youth-and-community']
    expect(isCategoryVisible(youth, 'preview')).toBe(true)
  })
})

describe('categoryServices', () => {
  it('lists the severance service once, not its /start step', () => {
    const severance = categoryServices(
      'money-financial-support',
      'public',
    ).filter(
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
    const inWork = categoryServices('work-employment', 'public').filter(
      (p) => p.slug === 'calculate-severance-pay',
    )
    expect(inWork).toHaveLength(1)
    expect(inWork[0].url).toBe(
      'money-financial-support/calculate-severance-pay',
    )
  })

  it('drops a category whose only service is preview from the public listing', () => {
    expect(categoryServices('pensions-and-gratuities', 'public')).toHaveLength(
      0,
    )
    expect(
      categoryServices('pensions-and-gratuities', 'preview').length,
    ).toBeGreaterThan(0)
  })
})

describe('runtime status overlay (service_status)', () => {
  const publicPage = () =>
    findPage('money-financial-support/calculate-severance-pay')!
  // The overlay is keyed by the canonical service key (form_id ?? content slug).
  const keyOf = (p: { frontmatter: { form_id?: string }; slug: string }) =>
    p.frontmatter.form_id ?? p.slug

  it('pageLevel gates an otherwise-public page when the overlay disables it', () => {
    const page = publicPage()
    const overlay = new Map<string, ViewLevel>([[page.slug, 'preview']])
    expect(pageLevel(page)).toBe('public')
    expect(pageLevel(page, overlay)).toBe('preview')
  })

  it('isVisible hides a disabled page from the public but a token unlocks it', () => {
    const page = publicPage()
    const overlay = new Map<string, ViewLevel>([[page.slug, 'preview']])
    expect(isVisible(page, 'public', overlay)).toBe(false)
    expect(isVisible(page, 'preview', overlay)).toBe(true)
  })

  it('keys the overlay by form_id for a form-backed service (not the content slug)', () => {
    // service_status rows use the canonical key: form_id for a form service.
    const formPage = PAGES.find(
      (p) => p.frontmatter.form_id && p.frontmatter.form_id !== p.slug,
    )!
    expect(formPage).toBeDefined()
    const formId = formPage.frontmatter.form_id!

    // Keyed by form_id → gates.
    expect(pageLevel(formPage, new Map([[formId, 'preview']]))).toBe('preview')
    // Keyed by the content slug → NO match, falls back to frontmatter.
    expect(pageLevel(formPage, new Map([[formPage.slug, 'preview']]))).toBe(
      formPage.frontmatter.visibility,
    )
  })

  it('an enabled overlay publishes a page whose frontmatter default is preview', () => {
    const previewPage = PAGES.find((p) => pageLevel(p) === 'preview')!
    const overlay = new Map<string, ViewLevel>([[keyOf(previewPage), 'public']])
    expect(isVisible(previewPage, 'public')).toBe(false)
    expect(isVisible(previewPage, 'public', overlay)).toBe(true)
  })

  it('urlLevel and isUrlVisible respect the overlay', () => {
    const page = publicPage()
    const overlay = new Map<string, ViewLevel>([[page.slug, 'preview']])
    expect(urlLevel(page.url, overlay)).toBe('preview')
    expect(isUrlVisible(page.url, 'public', overlay)).toBe(false)
    expect(isUrlVisible(page.url, 'preview', overlay)).toBe(true)
  })

  it('categoryServices drops a service the overlay disables, keeping it for reviewers', () => {
    const cat = 'family-birth-relationships'
    const target = categoryServices(cat, 'public')[0]
    expect(target).toBeDefined()
    const overlay = new Map<string, ViewLevel>([[keyOf(target), 'preview']])
    expect(
      categoryServices(cat, 'public', overlay).some(
        (p) => p.slug === target.slug,
      ),
    ).toBe(false)
    expect(
      categoryServices(cat, 'preview', overlay).some(
        (p) => p.slug === target.slug,
      ),
    ).toBe(true)
  })

  it('isCategoryVisible hides a category once the overlay disables all its public services', () => {
    const cat = CATEGORY_BY_SLUG['family-birth-relationships']
    const overlay = new Map<string, ViewLevel>(
      categoryServices('family-birth-relationships', 'public').map((p) => [
        keyOf(p),
        'preview' as ViewLevel,
      ]),
    )
    expect(isCategoryVisible(cat, 'public', overlay)).toBe(false)
    expect(isCategoryVisible(cat, 'preview', overlay)).toBe(true)
  })
})
