import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentPage } from '../content/registry'
import type * as CategoryApiModule from '../lib/api-v2-categories'
// Type-only, so it erases at runtime and the route still loads lazily, after
// the mocks below are in place.
import type * as ContentRouteModule from './$'
import { processMarkdown } from '../utils/markdown/processor'

// Mock the registry to drive the gate's throw paths deterministically. Only the
// exports the routes use are stubbed.
const mocks = vi.hoisted(() => ({
  findPage: vi.fn(),
  isVisible: vi.fn(),
  isCategoryVisible: vi.fn(() => true),
  categoryServices: vi.fn(() => [] as ContentPage[]),
  pageLevel: vi.fn(() => 'public' as const),
  isSubPage: vi.fn(() => false),
  isStartSubPageVisible: vi.fn(() => true),
  isUrlVisible: vi.fn(() => true),
  urlLevel: vi.fn(() => 'public' as const),
  resolveBareSlugRedirect: vi.fn(() => undefined as string | undefined),
  PAGES: [] as ContentPage[],
}))

vi.mock('../content/registry', () => mocks)

// The `$` loader resolves the available-forms list via a server function; stub
// it so the gating tests don't reach the network.
const formMocks = vi.hoisted(() => ({
  getAvailableForms: vi.fn(async () => ['get-birth-certificate']),
  getMaintenanceForms: vi.fn(async () => [] as string[]),
  getClosedForms: vi.fn(async () => [] as string[]),
}))
vi.mock('../lib/available-forms', () => formMocks)

// The reviewer-augmentation step calls checkFormAccessible for a non-public
// form viewed by a reviewer; stub it so the gating tests don't reach the
// network. Defaults to "accessible" so a reviewer keeps the form.
const accessMocks = vi.hoisted(() => ({
  checkFormAccessible: vi.fn(async () => true),
}))
vi.mock('../lib/preview-form-access', () => accessMocks)

// api_v2 is asked first (#2944); a miss falls back to the registry, so the
// static-page tests above keep their behaviour.
const v2Mocks = vi.hoisted(() => ({
  getApiV2Page: vi.fn(async (): Promise<unknown> => ({ kind: 'miss' })),
}))
vi.mock('../lib/api-v2-page', () => v2Mocks)

const categoryMocks = vi.hoisted(() => ({
  getApiV2CategoryListing:
    vi.fn<typeof CategoryApiModule.getApiV2CategoryListing>(),
}))
vi.mock('../lib/api-v2-categories', async (importOriginal) => ({
  ...(await importOriginal<typeof CategoryApiModule>()),
  ...categoryMocks,
}))

// Legacy mode: api_v2 categories are off, so the static taxonomy applies.
const STATIC = { kind: 'disabled' } as const

const fakePage: ContentPage = {
  slug: 'secret-service',
  url: 'secret-service',
  frontmatter: { title: 'Secret', categories: [], visibility: 'draft' },
  body: '',
  hast: { type: 'root', children: [] },
}

function caught(fn: () => unknown): unknown {
  try {
    fn()
    return undefined
  } catch (e) {
    return e
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isCategoryVisible.mockReturnValue(true)
  mocks.categoryServices.mockReturnValue([])
  mocks.pageLevel.mockReturnValue('public')
  mocks.isSubPage.mockReturnValue(false)
  mocks.isStartSubPageVisible.mockReturnValue(true)
  mocks.isUrlVisible.mockReturnValue(true)
  mocks.urlLevel.mockReturnValue('public')
  mocks.resolveBareSlugRedirect.mockReturnValue(undefined)
  v2Mocks.getApiV2Page.mockResolvedValue({ kind: 'miss' })
  categoryMocks.getApiV2CategoryListing.mockResolvedValue({
    kind: 'unavailable',
  })
  // The loader asks api_v2 only when it is configured (#3127).
  vi.stubEnv('VITE_API_V2_URL', 'http://api.example')
})

// Load the route once. Pulling the route + content graph through Vite's
// transform takes longer than the 5s default testTimeout on a loaded CI runner,
// and the cost lands on whichever test imports first — so the hook takes it,
// with its own generous timeout, and every test then sees a warm module.
let Route: typeof ContentRouteModule.Route
beforeAll(async () => {
  ;({ Route } = await import('./$'))
}, 60_000)

describe('$ route loader gating', () => {
  it.each([undefined, 'page-form'])(
    'filters closed and disabled targets independently of page form %s',
    async (formId) => {
      mocks.findPage.mockReturnValue({
        ...fakePage,
        frontmatter: { ...fakePage.frontmatter, form_id: formId },
      })
      mocks.isVisible.mockReturnValue(true)
      const publicForms = [
        'page-form',
        'closed-form',
        'disabled-form',
        'open-form',
      ]
      formMocks.getAvailableForms.mockResolvedValueOnce(publicForms)
      formMocks.getClosedForms.mockResolvedValueOnce(['closed-form'])
      const loader = Route.options.loader as (a: unknown) => Promise<unknown>
      const result = await loader({
        params: { _splat: 'secret-service' },
        context: {
          level: 'public',
          serviceStatuses: [['disabled-form', 'form_disabled']],
          categoryTree: STATIC,
        },
      })
      expect(result).toMatchObject({
        availableForms: ['page-form', 'open-form'],
        applicationClosed: false,
        underMaintenance: false,
      })
      expect(publicForms).toEqual([
        'page-form',
        'closed-form',
        'disabled-form',
        'open-form',
      ])
    },
  )

  it('checks explicit preview targets once each and excludes inaccessible forms', async () => {
    const { hast } = await processMarkdown(
      ':::action{form="review-form"}\nReview\n:::\n\n:::action{form="review-form"}\nAgain\n:::\n\n:::action{form="denied-form"}\nDenied\n:::',
    )
    mocks.findPage.mockReturnValue({ ...fakePage, hast })
    mocks.isVisible.mockReturnValue(true)
    accessMocks.checkFormAccessible
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const result = await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'preview', serviceStatuses: [], categoryTree: STATIC },
    })
    expect(result).toMatchObject({
      availableForms: ['get-birth-certificate', 'review-form'],
    })
    expect(accessMocks.checkFormAccessible).toHaveBeenCalledTimes(2)
    expect(accessMocks.checkFormAccessible).toHaveBeenCalledWith({
      data: 'review-form',
    })
    expect(accessMocks.checkFormAccessible).toHaveBeenCalledWith({
      data: 'denied-form',
    })
  })

  it('throws notFound for a gated page the viewer cannot see', async () => {
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(false)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)
    expect(err).toBeDefined()
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isVisible).toHaveBeenCalledWith(fakePage, 'public', new Map())
  })

  it('301-redirects a bare service slug to its canonical URL (#2145)', async () => {
    // No page/category matches the bare slug, so the loader reaches the
    // pre-404 bare-slug resolution.
    mocks.findPage.mockReturnValue(undefined)
    mocks.resolveBareSlugRedirect.mockReturnValue(
      'family-birth-relationships/get-marriage-certificate',
    )

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'get-marriage-certificate' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)

    const opts = (err as { options?: { href?: string; statusCode?: number } })
      .options
    expect(opts?.href).toBe(
      '/family-birth-relationships/get-marriage-certificate',
    )
    expect(opts?.statusCode).toBe(301)
    // Gating context is threaded through to the resolver.
    expect(mocks.resolveBareSlugRedirect).toHaveBeenCalledWith(
      'get-marriage-certificate',
      'public',
      new Map(),
    )
  })

  it('falls through to notFound when a bare slug does not resolve (#2145)', async () => {
    mocks.findPage.mockReturnValue(undefined)
    mocks.resolveBareSlugRedirect.mockReturnValue(undefined)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'not-a-real-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)

    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
  })

  it('throws notFound for a /start step whose form is non-public to the public', async () => {
    const startPage: ContentPage = {
      ...fakePage,
      slug: 'apply-for-conductor-licence/start',
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'apply-for-conductor-licence',
      },
    }
    mocks.findPage.mockReturnValue(startPage)
    mocks.isVisible.mockReturnValue(true)
    // getAvailableForms returns only 'get-birth-certificate' — the conductor
    // form (preview/maintenance) is absent, i.e. non-public.

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'work-employment/apply-for-conductor-licence/start' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
  })

  it('serves a /start step whose form is in the public available list', async () => {
    const startPage: ContentPage = {
      ...fakePage,
      slug: 'get-birth-certificate/start',
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'get-birth-certificate',
      },
    }
    mocks.findPage.mockReturnValue(startPage)
    mocks.isVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'life-events/get-birth-certificate/start' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })) as { kind: string }
    expect(data.kind).toBe('page')
  })

  it('serves a non-public /start step to a reviewer who can access the form', async () => {
    const startPage: ContentPage = {
      ...fakePage,
      slug: 'apply-for-conductor-licence/start',
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'apply-for-conductor-licence',
      },
    }
    mocks.findPage.mockReturnValue(startPage)
    mocks.isVisible.mockReturnValue(true)
    accessMocks.checkFormAccessible.mockResolvedValueOnce(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'work-employment/apply-for-conductor-licence/start' },
      context: { level: 'preview', serviceStatuses: [], categoryTree: STATIC },
    })) as { kind: string }
    expect(data.kind).toBe('page')
  })

  it('returns the page (with the available-forms list) when the viewer can see it', async () => {
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'draft', serviceStatuses: [], categoryTree: STATIC },
    })
    expect(data).toEqual({
      kind: 'page',
      url: fakePage.url,
      availableForms: ['get-birth-certificate'],
      underMaintenance: false,
      applicationClosed: false,
      level: 'public',
      startSubPageVisible: true,
    })
    expect((data as { page?: unknown }).page).toBeUndefined()
    expect(mocks.isVisible).toHaveBeenCalledWith(fakePage, 'draft', new Map())
  })

  it('flags a page whose form is under maintenance', async () => {
    const formPage: ContentPage = {
      ...fakePage,
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'post-office-redirection-individual',
      },
    }
    mocks.findPage.mockReturnValue(formPage)
    mocks.isVisible.mockReturnValue(true)
    formMocks.getMaintenanceForms.mockResolvedValueOnce([
      'post-office-redirection-individual',
    ])

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })) as { underMaintenance: boolean }
    expect(data.underMaintenance).toBe(true)
  })

  it('does not flag a page whose form is not under maintenance', async () => {
    const formPage: ContentPage = {
      ...fakePage,
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'get-birth-certificate',
      },
    }
    mocks.findPage.mockReturnValue(formPage)
    mocks.isVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })) as { underMaintenance: boolean }
    expect(data.underMaintenance).toBe(false)
  })

  it('flags a page whose form has closed and hides its Start link (#1936)', async () => {
    const formPage: ContentPage = {
      ...fakePage,
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'get-birth-certificate',
      },
    }
    mocks.findPage.mockReturnValue(formPage)
    mocks.isVisible.mockReturnValue(true)
    formMocks.getClosedForms.mockResolvedValueOnce(['get-birth-certificate'])

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })) as { applicationClosed: boolean; availableForms: string[] }
    expect(data.applicationClosed).toBe(true)
    // Closed forms are stripped from availableForms so the Start CTA is hidden.
    expect(data.availableForms).not.toContain('get-birth-certificate')
  })

  it('does not flag a page whose form has not closed (#1936)', async () => {
    const formPage: ContentPage = {
      ...fakePage,
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'get-birth-certificate',
      },
    }
    mocks.findPage.mockReturnValue(formPage)
    mocks.isVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })) as { applicationClosed: boolean; availableForms: string[] }
    expect(data.applicationClosed).toBe(false)
    expect(data.availableForms).toContain('get-birth-certificate')
  })

  it('hides the form and flags maintenance when service_status disables it for the public', async () => {
    const formPage: ContentPage = {
      ...fakePage,
      slug: 'svc',
      url: 'svc',
      frontmatter: {
        ...fakePage.frontmatter,
        visibility: 'public',
        form_id: 'svc-form',
      },
    }
    mocks.findPage.mockReturnValue(formPage)
    mocks.isVisible.mockReturnValue(true)
    formMocks.getAvailableForms.mockResolvedValueOnce(['svc-form'])

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'svc' },
      context: {
        // Status rows are keyed by the canonical key — the form_id here.
        level: 'public',
        serviceStatuses: [['svc-form', 'form_disabled']],
        categoryTree: STATIC,
      },
    })) as { availableForms: string[]; underMaintenance: boolean }
    // The form is dropped from the public available list (Start hidden) and the
    // maintenance notice is flagged.
    expect(data.availableForms).toEqual([])
    expect(data.underMaintenance).toBe(true)
  })
})

describe('$ route api_v2 pages (#2944)', () => {
  const v2Page = {
    ...fakePage,
    slug: 'v2-service',
    url: 'work-employment/v2-service',
    frontmatter: {
      ...fakePage.frontmatter,
      visibility: 'public' as const,
      form_id: 'get-birth-certificate',
    },
    hideStartLinks: false,
  }
  const load = (page: typeof v2Page, level = 'public') => {
    v2Mocks.getApiV2Page.mockResolvedValue({ kind: 'page', page })
    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    return loader({
      params: { _splat: page.url },
      context: { level, serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e) as Promise<Record<string, unknown>>
  }

  it('serves the api_v2 page over the registry, as public', async () => {
    mocks.findPage.mockReturnValue(fakePage)
    const data = await load(v2Page)
    expect(v2Mocks.getApiV2Page).toHaveBeenCalledWith({
      data: '/work-employment/v2-service',
    })
    expect(data).toMatchObject({
      kind: 'page',
      url: v2Page.url,
      page: v2Page,
      level: 'public',
      startSubPageVisible: true,
    })
    // api_v2 already enforced visibility.
    expect(mocks.isVisible).not.toHaveBeenCalled()
  })

  it('never asks api_v2 when VITE_API_V2_URL is unset, serving the registry page (#3127)', async () => {
    vi.stubEnv('VITE_API_V2_URL', '')
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(true)
    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: fakePage.url },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })) as Record<string, unknown>
    expect(v2Mocks.getApiV2Page).not.toHaveBeenCalled()
    expect(data).toMatchObject({ kind: 'page', url: fakePage.url })
  })

  it('301-redirects to the api_v2 redirect target', async () => {
    v2Mocks.getApiV2Page.mockResolvedValue({
      kind: 'redirect',
      to: '/work-employment/new-service',
    })
    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'work-employment/old-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)
    const opts = (err as { options?: { href?: string; statusCode?: number } })
      .options
    expect(opts?.href).toBe('/work-employment/new-service')
    expect(opts?.statusCode).toBe(301)
  })

  it('hides the /start step when api_v2 says so', async () => {
    const data = await load({ ...v2Page, hideStartLinks: true })
    expect(data.startSubPageVisible).toBe(false)
  })

  it('applies the closed-form state to an api_v2 page', async () => {
    formMocks.getClosedForms.mockResolvedValueOnce(['get-birth-certificate'])
    const data = await load(v2Page)
    expect(data.applicationClosed).toBe(true)
    expect(data.availableForms).not.toContain('get-birth-certificate')
  })

  it('throws notFound for an api_v2 /start step whose form is not available', async () => {
    formMocks.getClosedForms.mockResolvedValueOnce(['get-birth-certificate'])
    const err = await load({ ...v2Page, slug: 'v2-service/start' })
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
  })

  it('flags an api_v2 page whose form is under maintenance', async () => {
    formMocks.getMaintenanceForms.mockResolvedValueOnce([
      'get-birth-certificate',
    ])
    const data = await load(v2Page)
    expect(data.underMaintenance).toBe(true)
  })
})

describe('$ route category gating', () => {
  it('throws notFound for a category with no service visible at the viewer level', async () => {
    mocks.isCategoryVisible.mockReturnValue(false)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'pensions-and-gratuities' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isCategoryVisible).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'pensions-and-gratuities' }),
      'public',
      new Map(),
    )
  })

  it('renders the category for a reviewer whose level can see it', async () => {
    mocks.isCategoryVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'pensions-and-gratuities' },
      context: { level: 'preview', serviceStatuses: [], categoryTree: STATIC },
    })) as { kind: string; category: { slug: string } }
    expect(data.kind).toBe('category')
    expect(data.category.slug).toBe('pensions-and-gratuities')
  })
})

describe('$ route subcategory gating', () => {
  it('throws notFound for a subcategory whose category is hidden at the viewer level', async () => {
    mocks.findPage.mockReturnValue(undefined)
    mocks.isCategoryVisible.mockReturnValue(false)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'youth-and-community/youth-development-leadership' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch((e: unknown) => e)
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isCategoryVisible).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'youth-and-community' }),
      'public',
      new Map(),
    )
  })

  it('renders the subcategory for a reviewer whose level can see it', async () => {
    mocks.findPage.mockReturnValue(undefined)
    mocks.isCategoryVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'youth-and-community/youth-development-leadership' },
      context: { level: 'preview', serviceStatuses: [], categoryTree: STATIC },
    })) as { kind: string; subcategory: { slug: string } }
    expect(data.kind).toBe('subcategory')
    expect(data.subcategory.slug).toBe('youth-development-leadership')
  })

  it('skips the api_v2 lookup for a known subcategory URL (#2950)', async () => {
    mocks.findPage.mockReturnValue(undefined)
    mocks.isCategoryVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    await loader({
      params: { _splat: 'youth-and-community/youth-development-leadership' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    })
    expect(v2Mocks.getApiV2Page).not.toHaveBeenCalled()
  })

  it('still asks api_v2 for a two-segment URL that is not a subcategory', async () => {
    mocks.findPage.mockReturnValue(undefined)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    await loader({
      params: { _splat: 'youth-and-community/some-service' },
      context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
    }).catch(() => undefined)
    expect(v2Mocks.getApiV2Page).toHaveBeenCalledWith({
      data: '/youth-and-community/some-service',
    })
  })
})

describe('form route beforeLoad gating', () => {
  it('throws notFound when the viewer cannot see the owning service', async () => {
    mocks.isUrlVisible.mockReturnValue(false)
    const { Route } =
      await import('./money-financial-support/calculate-severance-pay/form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
      }),
    )
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
  })

  it('allows access when the viewer level can see the service', async () => {
    mocks.isUrlVisible.mockReturnValue(true)
    const { Route } =
      await import('./money-financial-support/calculate-severance-pay/form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: {
          level: 'preview',
          serviceStatuses: [],
          categoryTree: STATIC,
        },
      }),
    )
    expect(err).toBeUndefined()
  })

  it('allows public access when the owning service is public', async () => {
    mocks.isUrlVisible.mockReturnValue(true)
    const { Route } =
      await import('./money-financial-support/calculate-severance-pay/form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: { level: 'public', serviceStatuses: [], categoryTree: STATIC },
      }),
    )
    expect(err).toBeUndefined()
  })
})

// The real loader and category resolver run against a stubbed listing response.
// scripts/check-api-v2-categories.mjs covers the built RPC wiring.
describe('$ route loader in api_v2 category mode (ADR 0078)', () => {
  const ref = (url: string, title: string) => ({
    slug: url.split('/').at(-1) ?? '',
    url,
    title,
    description: null,
  })

  const FAMILY = ref('/family-renamed', 'Family (api_v2)')
  const BIRTHS = ref('/family-renamed/births', 'Births')

  const tree: CategoryApiModule.CategoryTreeResult = {
    kind: 'found',
    categories: [{ ...FAMILY, subcategories: [BIRTHS] }],
  }

  type LoaderData = (typeof Route)['types']['loaderData']

  type LoaderArgs = Parameters<
    Extract<
      NonNullable<(typeof Route)['options']['loader']>,
      (args: never) => Promise<LoaderData>
    >
  >[0]

  /** The part of the router's loader argument that `$`'s loader reads. */
  type ReadLoaderArgs = Pick<LoaderArgs, 'params'> & {
    context: Pick<
      LoaderArgs['context'],
      'level' | 'serviceStatuses' | 'categoryTree'
    >
  }

  const load = (
    splat: string,
    categoryTree: CategoryApiModule.CategoryTreeResult = tree,
  ): Promise<LoaderData> =>
    // SAFETY: `$` declares its loader in the plain-function form, and it
    // reads only `params._splat` and `context.{level, serviceStatuses,
    // categoryTree}` (ReadLoaderArgs, picked from the router's own type);
    // the router's other loader arguments (abort controller, location, deps,
    // preload flag) go unread.
    (Route.options.loader as (args: ReadLoaderArgs) => Promise<LoaderData>)({
      params: { _splat: splat },
      context: { level: 'public', serviceStatuses: [], categoryTree },
    })

  /** The JSON-LD `$`'s head writes for this loader result, as script text. */
  const ldScripts = (loaderData: LoaderData): string[] =>
    // SAFETY: `$`'s head reads only `loaderData`; the router's other head
    // arguments go unread.
    (
      Route.options.head as (args: { loaderData: LoaderData }) => {
        scripts?: Array<{ children: string }>
      }
    )({ loaderData }).scripts?.map((script) => script.children) ?? []

  it('serves a static page when the tree and listing are unavailable', async () => {
    mocks.findPage.mockReturnValue({
      ...fakePage,
      url: 'family-renamed/secret-service',
    })
    mocks.isVisible.mockReturnValue(true)

    await expect(
      load('family-renamed/secret-service', { kind: 'unavailable' }),
    ).resolves.toMatchObject({
      kind: 'page',
      url: 'family-renamed/secret-service',
    })
    expect(categoryMocks.getApiV2CategoryListing).toHaveBeenCalledWith({
      data: ['family-renamed', 'secret-service'],
    })
    expect(v2Mocks.getApiV2Page).toHaveBeenCalledWith({
      data: '/family-renamed/secret-service',
    })
    expect(mocks.findPage).toHaveBeenCalledWith('family-renamed/secret-service')
    expect(mocks.categoryServices).not.toHaveBeenCalled()
  })

  it('keeps the category error when the tree and listing are unavailable and no page resolves', async () => {
    mocks.findPage.mockReturnValue(undefined)

    await expect(
      load('family-renamed/missing-page', { kind: 'unavailable' }),
    ).rejects.toThrow(
      'Category listing unavailable for /family-renamed/missing-page',
    )
    expect(v2Mocks.getApiV2Page).toHaveBeenCalledWith({
      data: '/family-renamed/missing-page',
    })
    expect(mocks.findPage).toHaveBeenCalledWith('family-renamed/missing-page')
    expect(mocks.categoryServices).not.toHaveBeenCalled()
  })

  it('does not read a page when a listed category has an unavailable listing', async () => {
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(true)

    await expect(load('family-renamed')).rejects.toThrow(
      'Category listing unavailable for /family-renamed',
    )
    expect(categoryMocks.getApiV2CategoryListing).toHaveBeenCalledWith({
      data: ['family-renamed'],
    })
    expect(v2Mocks.getApiV2Page).not.toHaveBeenCalled()
    expect(mocks.findPage).not.toHaveBeenCalled()
  })

  it('never shows a static category api_v2 does not list', async () => {
    mocks.findPage.mockReturnValue(undefined)

    // A real static category and subcategory, absent from api_v2's tree.
    for (const splat of [
      'youth-and-community',
      'youth-and-community/youth-development-leadership',
    ]) {
      // A 404, so neither the static listing nor a listing read ran.
      await expect(load(splat)).rejects.toMatchObject({ isNotFound: true })
    }

    expect(mocks.categoryServices).not.toHaveBeenCalled()
  })

  it("carries an api_v2 page's own trail to the breadcrumbs and JSON-LD", async () => {
    const trail = [
      { name: 'Family (api_v2)', url: '/family-renamed' },
      { name: 'Register a birth', url: '/family-renamed/register-a-birth' },
    ]

    v2Mocks.getApiV2Page.mockResolvedValue({
      kind: 'page',
      page: {
        ...fakePage,
        slug: 'register-a-birth',
        url: 'family-renamed/register-a-birth',
        frontmatter: { title: 'Register a birth', categories: [] },
        hideStartLinks: false,
        breadcrumbs: trail,
      },
    })
    const data = await load('family-renamed/register-a-birth')
    expect(data).toHaveProperty('kind', 'page')
    expect(data).toHaveProperty('breadcrumbs', trail)

    const list = ldScripts(data)
      .map((text) => JSON.parse(text))
      .find((ld) => ld['@type'] === 'BreadcrumbList')

    expect(
      list.itemListElement.map((item: { name: string }) => item.name),
    ).toEqual(['Home', 'Family (api_v2)', 'Register a birth'])
  })

  it('writes JSON-LD without a literal <, parsing back to the same names', async () => {
    const title = 'Fees < 100 & over'
    const category = 'Grants < 5 years'
    v2Mocks.getApiV2Page.mockResolvedValue({
      kind: 'page',
      page: {
        ...fakePage,
        slug: 'fees',
        url: 'family-renamed/fees',
        frontmatter: { title, description: 'Under < over', categories: [] },
        hideStartLinks: false,
        breadcrumbs: [
          { name: category, url: '/family-renamed' },
          { name: title, url: '/family-renamed/fees' },
        ],
      },
    })
    const texts = ldScripts(await load('family-renamed/fees'))

    expect(texts).toHaveLength(2)

    for (const text of texts) expect(text).not.toContain('<')

    const [service, trail] = texts.map((text) => JSON.parse(text))

    expect(service).toMatchObject({ name: title, description: 'Under < over' })
    expect(
      trail.itemListElement.map((item: { name: string }) => item.name),
    ).toEqual(['Home', category, title])
  })

  it('labels a static page from the api_v2 tree, never the static taxonomy', async () => {
    mocks.findPage.mockReturnValue({
      ...fakePage,
      url: 'youth-and-community/a-static-page',
      frontmatter: { title: 'A static page', categories: [] },
    })
    mocks.isVisible.mockReturnValue(true)
    const data = await load('youth-and-community/a-static-page')
    // Youth and community is not in api_v2's tree, so it is left out.
    expect(data).toHaveProperty('kind', 'page')
    expect(data).toHaveProperty('breadcrumbs', [
      { name: 'A static page', url: '/youth-and-community/a-static-page' },
    ])
  })
})
