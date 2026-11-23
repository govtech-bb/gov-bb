import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFunnelSteps,
  buildStepFunnel,
  buildVisitFunnelSteps,
  fetchFormDefinition,
  fetchFormDetailData,
  fetchFormList,
  fetchOverviewData,
  fetchSearchData,
  fetchToolsData,
  funnelHeadline,
  isConfigured,
  isLandingConfigured,
  shapeFlow,
  shapeFormList,
  shapeFunnel,
  shapePages,
  shapeSubmitError,
  type UmamiConfig,
} from './umami-server'
import type { ServiceIndexEntry } from '@govtech-bb/content'
import { __clearCache } from './cache'

describe('configured gates', () => {
  const full = {
    apiKey: 'k',
    landingWebsiteId: 'land',
    formsWebsiteId: 'forms',
    formsApiUrl: 'https://api',
  }

  it('isConfigured requires apiKey + landing + forms', () => {
    expect(isConfigured(full)).toBe(true)
    expect(isConfigured({ ...full, formsWebsiteId: '' })).toBe(false)
    expect(isConfigured({ ...full, landingWebsiteId: '' })).toBe(false)
    expect(isConfigured({ ...full, apiKey: '' })).toBe(false)
  })

  it('isLandingConfigured needs only apiKey + landing (not the forms site)', () => {
    expect(isLandingConfigured({ ...full, formsWebsiteId: '' })).toBe(true)
    expect(isLandingConfigured({ ...full, landingWebsiteId: '' })).toBe(false)
    expect(isLandingConfigured({ ...full, apiKey: '' })).toBe(false)
  })
})

describe('buildFunnelSteps', () => {
  it('builds start→review→submit event steps for a formId', () => {
    expect(buildFunnelSteps('birth-cert')).toEqual([
      { type: 'event', value: 'birth-cert:form-start' },
      { type: 'event', value: 'birth-cert:form-review' },
      { type: 'event', value: 'birth-cert:form-submit' },
    ])
  })
})

describe('buildVisitFunnelSteps', () => {
  it('builds a page-visit → form-start funnel with a trailing wildcard path', () => {
    expect(buildVisitFunnelSteps('birth-cert')).toEqual([
      { type: 'path', value: '/forms/birth-cert*' },
      { type: 'event', value: 'birth-cert:form-start' },
    ])
  })
})

describe('shapeFunnel', () => {
  it('maps distinct-visitor funnel rows to labelled stages with dropoff %', () => {
    const funnel = shapeFunnel([
      { type: 'event', value: 'f:form-start', visitors: 100, dropoff: null },
      { type: 'event', value: 'f:form-review', visitors: 60, dropoff: 0.4 },
      { type: 'event', value: 'f:form-submit', visitors: 45, dropoff: 0.25 },
    ])
    expect(funnel.map((s) => s.label)).toEqual(['Start', 'Review', 'Submit'])
    expect(funnel[0].dropoffPct).toBe(0)
    expect(funnel[1].dropoffPct).toBe(40)
    expect(funnel[2].count).toBe(45)
  })
})

describe('buildStepFunnel (titled by-stepId funnel)', () => {
  const steps = [
    { stepId: 'a', title: 'Your details' },
    { stepId: 'b', title: 'Eligibility' },
    { stepId: 'c', title: 'Upload docs' },
  ]

  it('brackets titled steps with Start/Submit and reads views by stepId', () => {
    const out = buildStepFunnel(420, 200, steps, { a: 400, b: 120, c: 260 })
    expect(out.map((s) => s.label)).toEqual([
      'Start',
      'Step 1: Your details',
      'Step 2: Eligibility',
      'Step 3: Upload docs',
      'Submit',
    ])
    expect(out.map((s) => s.count)).toEqual([420, 400, 120, 260, 200])
    // no misleading step-over-step drop-off across branch points
    expect(out.every((s) => s.dropoffPct === 0)).toBe(true)
  })

  it('treats a step with no recorded views as zero', () => {
    const out = buildStepFunnel(5, 1, steps, { a: 5 })
    expect(out.map((s) => s.count)).toEqual([5, 5, 0, 0, 1])
  })

  it('appends Review and Confirmation around Submit when the tail is given (#1955)', () => {
    const out = buildStepFunnel(
      420,
      200,
      steps,
      { a: 400, b: 120, c: 260 },
      {
        reviewCount: 210,
        confirmationCount: 195,
      },
    )
    expect(out.map((s) => s.label)).toEqual([
      'Start',
      'Step 1: Your details',
      'Step 2: Eligibility',
      'Step 3: Upload docs',
      'Review',
      'Submit',
      'Confirmation',
    ])
    expect(out.map((s) => s.count)).toEqual([420, 400, 120, 260, 210, 200, 195])
  })

  it('appends payment stages only when payment-initiated is present (#1955)', () => {
    const out = buildStepFunnel(
      100,
      60,
      [{ stepId: 'a', title: 'Details' }],
      {
        a: 90,
      },
      {
        reviewCount: 70,
        confirmationCount: 58,
        paymentInitiatedCount: 55,
        paymentSuccessCount: 40,
      },
    )
    expect(out.map((s) => s.label)).toEqual([
      'Start',
      'Step 1: Details',
      'Review',
      'Submit',
      'Confirmation',
      'Payment initiated',
      'Payment success',
    ])
    expect(out.map((s) => s.count)).toEqual([100, 90, 70, 60, 58, 55, 40])
  })

  it('omits payment stages for a non-payment form (no payment-initiated)', () => {
    const out = buildStepFunnel(
      100,
      60,
      [{ stepId: 'a', title: 'Details' }],
      {
        a: 90,
      },
      {
        reviewCount: 70,
        confirmationCount: 58,
        paymentInitiatedCount: 0,
      },
    )
    expect(out.map((s) => s.label)).not.toContain('Payment initiated')
    expect(out.map((s) => s.label)).toEqual([
      'Start',
      'Step 1: Details',
      'Review',
      'Submit',
      'Confirmation',
    ])
  })

  it('stays backward-compatible (Start → steps → Submit) with no tail', () => {
    const out = buildStepFunnel(10, 4, [{ stepId: 'a', title: 'X' }], { a: 8 })
    expect(out.map((s) => s.label)).toEqual(['Start', 'Step 1: X', 'Submit'])
  })
})

describe('funnelHeadline', () => {
  it('takes distinct-visitor starts (first row) and completed (last row)', () => {
    expect(
      funnelHeadline([
        { type: 'event', value: 'f:form-start', visitors: 158, dropoff: null },
        { type: 'event', value: 'f:form-review', visitors: 90, dropoff: 0.43 },
        { type: 'event', value: 'f:form-submit', visitors: 59, dropoff: 0.34 },
      ]),
    ).toEqual({ starts: 158, completed: 59 })
  })

  it('is zeros for an empty funnel', () => {
    expect(funnelHeadline([])).toEqual({ starts: 0, completed: 0 })
  })
})

describe('shapeFormList (per-form starts + completion)', () => {
  it('derives starts, completions and completion% per form from funnel headlines', () => {
    const forms = [
      { formId: 'a', title: 'Form A' },
      { formId: 'b', title: 'Form B' },
    ]
    const headlines = new Map([['a', { starts: 200, completed: 50 }]])
    const out = shapeFormList(forms, headlines)
    expect(out[0]).toMatchObject({
      formId: 'a',
      starts: 200,
      completions: 50,
      completionPct: 25,
    })
    // no headline for the form → zeros, 0% (not NaN/Infinity)
    expect(out[1]).toMatchObject({
      starts: 0,
      completions: 0,
      completionPct: 0,
    })
  })
})

describe('shapeFlow (Sankey)', () => {
  it('merges by label per column, computes entry total and node share', () => {
    const flow = shapeFlow(
      [
        { items: ['/', '/passport', 'passport:form-start'], count: 50 },
        { items: ['/', '/passport'], count: 10 },
        { items: ['/', '/births', 'births:form-start'], count: 20 },
      ],
      4,
      8,
    )
    // column 0 = entry: only Home, carrying every visit → total 80, pct 100%.
    expect(flow.total).toBe(80)
    const home = flow.nodes.find((n) => n.column === 0 && n.label === 'Home')
    expect(home?.value).toBe(80)
    expect(home?.pct).toBe(1)
    // Home → Passport = 60 (50 + 10); its share of Home is 75%.
    const toPassport = flow.links.find(
      (l) =>
        l.source === home?.id &&
        flow.nodes.find((n) => n.id === l.target)?.label === 'Passport',
    )
    expect(toPassport?.value).toBe(60)
    // Start nodes are qualified by their root, so they stay distinct.
    const col2 = flow.nodes.filter((n) => n.column === 2)
    expect(col2.map((n) => n.label).sort()).toEqual([
      'Births · Start',
      'Passport · Start',
    ])
  })

  it('buckets low-traffic labels in a column into "Other (N)"', () => {
    const journeys = Array.from({ length: 8 }, (_, i) => ({
      items: ['/', `/service-${i}`],
      count: 10 - i, // descending so the last few are the smallest
    }))
    const flow = shapeFlow(journeys, 4, 3) // keep top 3 per column
    const col1 = flow.nodes.filter((n) => n.column === 1)
    // top 3 kept + 1 Other = 4 nodes; Other groups the remaining 5.
    expect(col1.length).toBe(4)
    expect(col1.some((n) => n.label === 'Other (5)')).toBe(true)
  })
})

describe('shapeSubmitError (#1916)', () => {
  it('computes rate over attempts and sorts reasons descending', () => {
    const se = shapeSubmitError(85, 15, [
      { value: 'network', total: 4 },
      { value: 'server', total: 9 },
      { value: 'payment-init', total: 2 },
    ])
    expect(se.total).toBe(15)
    expect(se.attempts).toBe(100)
    expect(se.rate).toBeCloseTo(0.15)
    expect(se.byReason.map((r) => r.reason)).toEqual([
      'server',
      'network',
      'payment-init',
    ])
  })

  it('buckets unknown reasons (e.g. legacy validation strings) into "other"', () => {
    const se = shapeSubmitError(0, 20, [
      { value: 'server', total: 5 },
      { value: 'field.a: required', total: 8 },
      { value: 'field.b: invalid', total: 7 },
    ])
    const other = se.byReason.find((r) => r.reason === 'other')
    expect(other?.count).toBe(15)
    expect(se.byReason[0]).toEqual({ reason: 'other', count: 15 })
  })

  it('returns a null rate when there were no attempts', () => {
    expect(shapeSubmitError(0, 0, []).rate).toBeNull()
  })
})

// A hung forms API must not stall the dashboard: each fetch is capped with
// AbortSignal.timeout and falls back to its empty shape on a timeout (#2080).
describe('forms-API fetch timeouts (#2080)', () => {
  const cfg: UmamiConfig = {
    apiKey: 'k',
    landingWebsiteId: 'l',
    formsWebsiteId: 'f',
    formsApiUrl: 'http://forms.test',
  }
  const timeoutError = () => new DOMException('timed out', 'TimeoutError')

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchFormList returns [] on a fetch timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()))
    expect(await fetchFormList(cfg)).toEqual([])
  })

  it('fetchFormDefinition returns the empty shape on a fetch timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()))
    const result = await fetchFormDefinition(cfg, 'passport-renewal')
    expect(result).toEqual({
      title: 'passport-renewal',
      steps: [],
      labelByField: {},
      messageByFieldCode: {},
    })
  })

  it('fetchFormList returns [] when the timeout fires during the body read', async () => {
    // Headers arrive (fetch resolves ok) but the body stalls, so the abort
    // lands on res.json(). This must still fall back, not throw past it (#2080).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(timeoutError()),
      }),
    )
    expect(await fetchFormList(cfg)).toEqual([])
  })

  it('passes an AbortSignal to fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchFormList(cfg)
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('re-throws a non-timeout fetch error rather than swallowing it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(fetchFormList(cfg)).rejects.toThrow('network down')
  })
})

describe('fetchToolsData (tool events read from Umami)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for a breakdown only for tools with events, filtered by tool', async () => {
    // Only the water tool has sent events. Answer each Umami GET by its query.
    const answers: Record<string, unknown> = {
      'tool-result/tool/': [{ value: 'water-outages', total: 5 }],
      'tool-action/tool/': [{ value: 'water-outages', total: 3 }],
      'tool-error/tool/': [],
      'tool-result/outcome/1.eq.tool.water-outages': [
        { value: 'parish-chosen', total: 3 },
        { value: 'subscribe-sent', total: 2 },
      ],
      'tool-action/action/1.eq.tool.water-outages': [
        { value: 'subscribe-submit', total: 3 },
      ],
    }
    const filtered: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL) => {
        const q = input.searchParams
        if (q.has('epf1')) filtered.push(String(q.get('epf1')))
        const key = `${q.get('event')}/${q.get('propertyName')}/${q.get('epf1') ?? ''}`
        const body = input.pathname.endsWith('/event-data/values')
          ? answers[key]
          : [] // URL and referrer metrics
        return { ok: true, status: 200, json: async () => body } as Response
      }),
    )

    const data = await fetchToolsData(
      {
        apiKey: 'k',
        landingWebsiteId: 'l',
        formsWebsiteId: 'f',
        formsApiUrl: 'http://forms.test',
      },
      'past-7-days',
    )

    expect(filtered.sort()).toEqual([
      '1.eq.tool.water-outages',
      '1.eq.tool.water-outages',
    ])
    const water = data.tools.find((t) => t.path.endsWith('/water-outages'))
    expect(water?.events).toMatchObject({
      results: 5,
      topAction: { action: 'subscribe-submit', count: 3 },
      errors: 0,
    })
    expect(data.tools.filter((t) => t.events !== null)).toHaveLength(1)
    expect(data.waterAlerts).toEqual({
      submitted: 3,
      sent: 2,
      confirmed: 0,
      unsubscribed: 0,
    })
  })
})

describe('Tools tab reads every landing URL (#3823)', () => {
  beforeEach(() => {
    __clearCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('counts a tool page that sits below more than 500 busier URLs', async () => {
    // URL rows like Umami's: busiest first, cut at the requested limit.
    const busier = Array.from({ length: 600 }, (_, i) => ({
      x: `/page-${i}`,
      visitors: 1000 - i,
    }))
    const quiet = { x: '/business-trade/crop-over-permits/result', visitors: 7 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL) => {
        const body = input.pathname.endsWith('/metrics/expanded')
          ? [...busier, quiet].slice(0, Number(input.searchParams.get('limit')))
          : []
        return { ok: true, status: 200, json: async () => body } as Response
      }),
    )

    const data = await fetchToolsData(
      {
        apiKey: 'k',
        landingWebsiteId: 'l',
        formsWebsiteId: 'f',
        formsApiUrl: 'http://forms.test',
      },
      'past-30-days',
    )

    const crop = data.tools.find((t) => t.path.includes('/crop-over-permits'))
    expect(crop?.visitors).toBe(7)
  })
})

describe('dashboard event reads ask for every event name (#3819)', () => {
  const cfg: UmamiConfig = {
    apiKey: 'k',
    landingWebsiteId: 'l',
    formsWebsiteId: 'f',
    formsApiUrl: 'http://forms.test',
  }
  /** Event rows like Umami's: busiest first, cut at the requested limit. The
   *  `quiet` row sits below 600 busier names. Every other read is empty. */
  const stubEvents = (quiet: { x: string; y: number }) => {
    const busier = Array.from({ length: 600 }, (_, i) => ({
      x: `form-${i}:form-step-view`,
      y: 1000 - i,
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const u = new URL(String(input))
        const body =
          u.pathname.endsWith('/metrics') &&
          u.searchParams.get('type') === 'event'
            ? [...busier, quiet].slice(0, Number(u.searchParams.get('limit')))
            : []
        return { ok: true, status: 200, json: async () => body } as Response
      }),
    )
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('counts a quiet form on its detail page', async () => {
    stubEvents({ x: 'quiet-form:form-start', y: 2 })
    const data = await fetchFormDetailData(cfg, 'quiet-form', 'past-7-days')
    expect(data.funnel[0]).toMatchObject({ label: 'Start', count: 2 })
  })

  it('counts searches on the overview', async () => {
    stubEvents({ x: 'search-submit', y: 4 })
    const data = await fetchOverviewData(cfg, 'past-7-days')
    expect(data.stats.searches).toBe(4)
  })
})

describe('shapePages (content pages joined to the public registry)', () => {
  const registry: ServiceIndexEntry[] = [
    {
      slug: 'get-birth-certificate',
      title: 'Get a copy of a birth certificate',
      category: 'family-birth-relationships',
      formId: 'get-birth-certificate',
      visibility: 'public',
    },
    {
      slug: 'stormready-barbados',
      title: 'StormReady Barbados',
      category: 'health-and-emergency-services',
      visibility: 'public',
    },
  ]

  it('joins a Umami path to its registry entry on /category/slug', () => {
    const rows = shapePages(
      [
        {
          x: '/family-birth-relationships/get-birth-certificate',
          pageviews: 90,
          visitors: 70,
        },
      ],
      registry,
      new Map([
        [
          '/family-birth-relationships/get-birth-certificate',
          [{ referrer: 'google', count: 9 }],
        ],
      ]),
    )
    expect(rows).toEqual([
      {
        path: '/family-birth-relationships/get-birth-certificate',
        title: 'Get a copy of a birth certificate',
        pageviews: 90,
        visitors: 70,
        formId: 'get-birth-certificate',
        topSources: [{ referrer: 'google', count: 9 }],
      },
    ])
  })

  it('sets formId null for a content page with no form', () => {
    const [row] = shapePages(
      [
        {
          x: '/health-and-emergency-services/stormready-barbados',
          pageviews: 5,
          visitors: 4,
        },
      ],
      registry,
      new Map(),
    )
    expect(row.formId).toBeNull()
    expect(row.title).toBe('StormReady Barbados')
  })

  it('drops a trafficked path that matches no public registry entry', () => {
    const rows = shapePages(
      [{ x: '/some/preview-or-unknown-page', pageviews: 999, visitors: 999 }],
      registry,
      new Map(),
    )
    expect(rows).toEqual([])
  })

  it('excludes tool prefixes, /start, /forms/* and system routes even if registered', () => {
    const rows = shapePages(
      [
        { x: '/bank-holiday-calendar', pageviews: 100, visitors: 80 },
        { x: '/forms/get-birth-certificate', pageviews: 50, visitors: 40 },
        {
          x: '/family-birth-relationships/register-a-birth/start',
          pageviews: 20,
          visitors: 10,
        },
        { x: '/sitemap.xml', pageviews: 5, visitors: 5 },
      ],
      registry,
      new Map(),
    )
    expect(rows).toEqual([])
  })

  it('normalises a trailing slash and aggregates duplicate rows for one path', () => {
    const rows = shapePages(
      [
        {
          x: '/family-birth-relationships/get-birth-certificate',
          pageviews: 60,
          visitors: 40,
        },
        {
          x: '/family-birth-relationships/get-birth-certificate/',
          pageviews: 30,
          visitors: 25,
        },
      ],
      registry,
      new Map(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].pageviews).toBe(90)
    expect(rows[0].visitors).toBe(65)
  })

  it('is empty when the registry or the URL rows are empty', () => {
    expect(shapePages([], registry, new Map())).toEqual([])
    expect(
      shapePages(
        [
          {
            x: '/family-birth-relationships/get-birth-certificate',
            pageviews: 1,
            visitors: 1,
          },
        ],
        [],
        new Map(),
      ),
    ).toEqual([])
  })
})

describe('fetchSearchData (search queries read from Umami)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves out a query seen fewer than 3 times but still counts it in the totals', async () => {
    // One person's name, searched once, found nothing and got no click.
    const answers: Record<string, unknown> = {
      'search/query': [
        { value: 'passport', total: 5 },
        { value: 'nis', total: 3 },
        { value: 'jane doe', total: 1 },
      ],
      'search/results': [
        { value: 8, total: 8 },
        { value: 0, total: 1 },
      ],
      'search-result-click/query': [
        { value: 'passport', total: 2 },
        { value: 'jane doe', total: 1 },
      ],
      'search-no-results/query': [{ value: 'jane doe', total: 1 }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL) => {
        const q = input.searchParams
        const body = answers[`${q.get('event')}/${q.get('propertyName')}`]
        return { ok: true, status: 200, json: async () => body } as Response
      }),
    )

    const data = await fetchSearchData(
      {
        apiKey: 'k',
        landingWebsiteId: 'l',
        formsWebsiteId: 'f',
        formsApiUrl: 'http://forms.test',
      },
      'past-90-days',
    )

    expect(data.queries.map((q) => q.query)).toEqual(['passport', 'nis'])
    expect(data.searches).toBe(9)
    expect(data.clicks).toBe(3)
    expect(data.zeroResultRate).toBeCloseTo(1 / 9)
  })
})
