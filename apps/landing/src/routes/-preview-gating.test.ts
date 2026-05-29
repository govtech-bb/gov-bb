import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentPage } from '../content/registry'

// Real content has no preview pages, so mock the registry to drive the gate's
// throw paths. Only the exports the routes use are stubbed.
const mocks = vi.hoisted(() => ({
  findPage: vi.fn(),
  isVisible: vi.fn(),
  isPreview: vi.fn(() => false),
  isSubPage: vi.fn(() => false),
  startSubPageInPreview: vi.fn(() => false),
  isUrlPreview: vi.fn(() => false),
  PAGES: [] as ContentPage[],
}))

vi.mock('../content/registry', () => mocks)

const fakePage: ContentPage = {
  slug: 'secret-service',
  url: 'secret-service',
  frontmatter: { title: 'Secret', categories: [], visibility: 'preview' },
  body: '',
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
  mocks.isPreview.mockReturnValue(false)
  mocks.isSubPage.mockReturnValue(false)
  mocks.startSubPageInPreview.mockReturnValue(false)
  mocks.isUrlPreview.mockReturnValue(false)
})

describe('$ route loader gating', () => {
  it('throws notFound for a preview page when not in preview mode', async () => {
    const { Route } = await import('./$')
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(false)

    const err = caught(() =>
      (Route.options.loader as (a: unknown) => unknown)({
        params: { _splat: 'secret-service' },
        context: { preview: false },
      }),
    )
    expect(err).toBeDefined()
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
    expect(mocks.isVisible).toHaveBeenCalledWith(fakePage, false)
  })

  it('returns the page when it is visible (preview mode)', async () => {
    const { Route } = await import('./$')
    mocks.findPage.mockReturnValue(fakePage)
    mocks.isVisible.mockReturnValue(true)

    const data = (Route.options.loader as (a: unknown) => unknown)({
      params: { _splat: 'secret-service' },
      context: { preview: true },
    })
    expect(data).toEqual({ kind: 'page', page: fakePage })
  })
})

describe('form route beforeLoad gating', () => {
  it('throws notFound when the owning service is preview and not unlocked', async () => {
    mocks.isUrlPreview.mockReturnValue(true)
    const { Route } =
      await import('./money-financial-support.calculate-severance-pay.form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: { preview: false },
      }),
    )
    expect((err as { isNotFound?: boolean }).isNotFound).toBe(true)
  })

  it('allows access with the preview token', async () => {
    mocks.isUrlPreview.mockReturnValue(true)
    const { Route } =
      await import('./money-financial-support.calculate-severance-pay.form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: { preview: true },
      }),
    )
    expect(err).toBeUndefined()
  })

  it('allows public access when the owning service is public', async () => {
    mocks.isUrlPreview.mockReturnValue(false)
    const { Route } =
      await import('./money-financial-support.calculate-severance-pay.form')
    const err = caught(() =>
      (Route.options.beforeLoad as (a: unknown) => unknown)({
        context: { preview: false },
      }),
    )
    expect(err).toBeUndefined()
  })
})
