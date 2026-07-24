import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFunnelSteps,
  buildStepFunnel,
  buildVisitFunnelSteps,
  fetchFormDefinition,
  fetchFormList,
  funnelHeadline,
  humanizeStep,
  shapeFlow,
  shapeFormList,
  shapeFunnel,
  shapeJourneyList,
  shapeSearch,
  shapeSubmitError,
  type UmamiConfig,
} from './umami-server'

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

describe('humanizeStep', () => {
  it('labels service pages, the home path, and qualifies Start/Form with the root', () => {
    expect(
      humanizeStep('/family-birth-relationships/get-birth-certificate'),
    ).toBe('Get birth certificate')
    expect(humanizeStep('/')).toBe('Home')
    // form-start event → "<root> · Start"
    expect(humanizeStep('get-birth-certificate:form-start')).toBe(
      'Get birth certificate · Start',
    )
    // /start and /form pages are qualified with the service segment above them
    expect(
      humanizeStep('/money-financial-support/get-a-textbook-grant/start'),
    ).toBe('Get a textbook grant · Start')
    expect(
      humanizeStep('/money-financial-support/get-a-textbook-grant/form'),
    ).toBe('Get a textbook grant · Form')
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

describe('shapeJourneyList', () => {
  it('uses pages only, drops form-start-event variants so journeys merge', () => {
    const rows = shapeJourneyList([
      // these three are the same page journey with different event noise — they
      // must all collapse to Home › Passport › Start
      {
        items: ['/', '/passport', '/passport/start', 'passport:form-start'],
        count: 40,
      },
      {
        items: ['/', '/passport', 'passport:form-start', '/passport/start'],
        count: 30,
      },
      { items: ['/', '/passport', '/passport/start'], count: 9 },
      { items: ['/', '/births'], count: 20 },
      // single-page visit (bounce) — excluded
      { items: ['/', null, null], count: 500 },
    ])
    expect(rows[0].items).toEqual(['Home', 'Passport', 'Start'])
    expect(rows[0].sessions).toBe(79) // 40 + 30 + 9 merged
    expect(rows[1].items).toEqual(['Home', 'Births'])
    expect(rows[1].sessions).toBe(20)
    // bounce excluded → total is 79 + 20 = 99, not 599
    expect(rows[0].share).toBeCloseTo(79 / 99)
    expect(rows.some((r) => r.items.length < 2)).toBe(false)
    expect(rows[0].entryPath).toBe('/') // entry step is Home
  })

  it('qualifies the entry step with its service when it is a start/form page', () => {
    const rows = shapeJourneyList([
      {
        items: [
          '/money-financial-support/get-a-textbook-grant/start',
          '/money-financial-support/get-a-textbook-grant/form',
        ],
        count: 12,
      },
    ])
    // entry is a /start page → qualified; later steps stay bare
    expect(rows[0].items).toEqual(['Get a textbook grant · Start', 'Form'])
    expect(rows[0].entryPath).toBe(
      '/money-financial-support/get-a-textbook-grant/start',
    )
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

describe('shapeSearch', () => {
  it('joins query counts, per-query clicks and zero-result flags into a ranked table', () => {
    const out = shapeSearch(
      [
        { value: 'passport', total: 100 },
        { value: 'birth certificate', total: 40 },
        { value: 'xyzzy', total: 10 },
      ],
      [
        { value: 0, total: 15 },
        { value: 3, total: 135 },
      ],
      [
        { value: 'passport', total: 60 },
        { value: 'birth certificate', total: 10 },
      ],
      [{ value: 'xyzzy', total: 10 }],
    )

    // overall: searches = 150, clicks = 70, ctr = 70/150 (stored 0–1).
    expect(out.searches).toBe(150)
    expect(out.clicks).toBe(70)
    expect(out.ctr).toBeCloseTo(70 / 150)
    // zero-result rate from the results distribution: 15 / 150.
    expect(out.zeroResultRate).toBeCloseTo(0.1)

    // ranked by searches, each with its own CTR (0–1) and zero-result flag.
    expect(out.queries.map((q) => q.query)).toEqual([
      'passport',
      'birth certificate',
      'xyzzy',
    ])
    expect(out.queries[0]).toEqual({
      query: 'passport',
      searches: 100,
      clicks: 60,
      ctr: 0.6,
      zeroResult: false,
    })
    expect(out.queries[2]).toMatchObject({
      query: 'xyzzy',
      clicks: 0,
      ctr: 0,
      zeroResult: true,
    })
  })

  it('takes total searches from the results distribution when the query distribution is row-capped', () => {
    // The query rows are truncated (only the top term survived a row cap), but
    // the low-cardinality results distribution carries the true total of 100.
    const out = shapeSearch(
      [{ value: 'passport', total: 20 }],
      [
        { value: 0, total: 10 },
        { value: 4, total: 90 },
      ],
      [{ value: 'passport', total: 25 }],
      [],
    )
    expect(out.searches).toBe(100) // max(20, 100), not the truncated 20
    expect(out.ctr).toBeCloseTo(25 / 100) // CTR is not inflated by truncation
    expect(out.zeroResultRate).toBeCloseTo(0.1)
  })

  it('caps the table at topN and degrades to zeros on empty input', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      value: `q${i}`,
      total: 25 - i,
    }))
    expect(shapeSearch(many, [], [], [], 20).queries).toHaveLength(20)

    const empty = shapeSearch([], [], [], [])
    expect(empty).toMatchObject({
      searches: 0,
      clicks: 0,
      ctr: 0,
      zeroResultRate: 0,
      queries: [],
    })
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
