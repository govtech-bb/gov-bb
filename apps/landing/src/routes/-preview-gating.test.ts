import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentPage } from '../content/registry'

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
  PAGES: [] as ContentPage[],
}))

vi.mock('../content/registry', () => mocks)

// The `$` loader resolves the available-forms list via a server function; stub
// it so the gating tests don't reach the network.
const formMocks = vi.hoisted(() => ({
  getAvailableForms: vi.fn(async () => ['get-birth-certificate']),
  getMaintenanceForms: vi.fn(async () => [] as string[]),
}))
vi.mock('../lib/available-forms', () => formMocks)

// The reviewer-augmentation step calls checkFormAccessible for a non-public
// form viewed by a reviewer; stub it so the gating tests don't reach the
// network. Defaults to "accessible" so a reviewer keeps the form.
const accessMocks = vi.hoisted(() => ({
  checkFormAccessible: vi.fn(async () => true),
}))
vi.mock('../lib/preview-form-access', () => accessMocks)

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
})

describe('$ route loader gating', () => {
  it('throws notFound for a gated page the viewer cannot see', async () => {
    const { Route } = await import('./$')
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(false)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'public' },
    }).catch((e: unknown) => e)
    expect(err).toBeDefined()
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isVisible).toHaveBeenCalledWith(fakePage, 'public')
  })

  it('throws notFound for a /start step whose form is non-public to the public', async () => {
    const { Route } = await import('./$')
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
      context: { level: 'public' },
    }).catch((e: unknown) => e)
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
  })

  it('serves a /start step whose form is in the public available list', async () => {
    const { Route } = await import('./$')
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
      context: { level: 'public' },
    })) as { kind: string }
    expect(data.kind).toBe('page')
  })

  it('serves a non-public /start step to a reviewer who can access the form', async () => {
    const { Route } = await import('./$')
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
      context: { level: 'preview' },
    })) as { kind: string }
    expect(data.kind).toBe('page')
  })

  it('returns the page (with the available-forms list) when the viewer can see it', async () => {
    const { Route } = await import('./$')
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = await loader({
      params: { _splat: 'secret-service' },
      context: { level: 'draft' },
    })
    expect(data).toEqual({
      kind: 'page',
      url: fakePage.url,
      availableForms: ['get-birth-certificate'],
      underMaintenance: false,
    })
    expect(mocks.isVisible).toHaveBeenCalledWith(fakePage, 'draft')
  })

  it('flags a page whose form is under maintenance', async () => {
    const { Route } = await import('./$')
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
      context: { level: 'public' },
    })) as { underMaintenance: boolean }
    expect(data.underMaintenance).toBe(true)
  })

  it('does not flag a page whose form is not under maintenance', async () => {
    const { Route } = await import('./$')
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
      context: { level: 'public' },
    })) as { underMaintenance: boolean }
    expect(data.underMaintenance).toBe(false)
  })
})

describe('$ route category gating', () => {
  it('throws notFound for a category with no service visible at the viewer level', async () => {
    const { Route } = await import('./$')
    mocks.isCategoryVisible.mockReturnValue(false)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'pensions-and-gratuities' },
      context: { level: 'public' },
    }).catch((e: unknown) => e)
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isCategoryVisible).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'pensions-and-gratuities' }),
      'public',
    )
  })

  it('renders the category for a reviewer whose level can see it', async () => {
    const { Route } = await import('./$')
    mocks.isCategoryVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'pensions-and-gratuities' },
      context: { level: 'preview' },
    })) as { kind: string; category: { slug: string } }
    expect(data.kind).toBe('category')
    expect(data.category.slug).toBe('pensions-and-gratuities')
  })
})

describe('$ route subcategory gating', () => {
  it('throws notFound for a subcategory whose category is hidden at the viewer level', async () => {
    const { Route } = await import('./$')
    mocks.findPage.mockReturnValue(undefined)
    mocks.isCategoryVisible.mockReturnValue(false)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const err = await loader({
      params: { _splat: 'youth-and-community/youth-development-leadership' },
      context: { level: 'public' },
    }).catch((e: unknown) => e)
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isCategoryVisible).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'youth-and-community' }),
      'public',
    )
  })

  it('renders the subcategory for a reviewer whose level can see it', async () => {
    const { Route } = await import('./$')
    mocks.findPage.mockReturnValue(undefined)
    mocks.isCategoryVisible.mockReturnValue(true)

    const loader = Route.options.loader as (a: unknown) => Promise<unknown>
    const data = (await loader({
      params: { _splat: 'youth-and-community/youth-development-leadership' },
      context: { level: 'preview' },
    })) as { kind: string; subcategory: { slug: string } }
    expect(data.kind).toBe('subcategory')
    expect(data.subcategory.slug).toBe('youth-development-leadership')
  })
})

describe('form route beforeLoad gating', () => {
  it('throws notFound when the viewer cannot see the owning service', async () => {
    mocks.isUrlVisible.mockReturnValue(false)
    const { Route } =
      await import('./money-financial-support/calculate-severance-pay/form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: { level: 'public' },
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
        context: { level: 'preview' },
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
        context: { level: 'public' },
      }),
    )
    expect(err).toBeUndefined()
  })
})
