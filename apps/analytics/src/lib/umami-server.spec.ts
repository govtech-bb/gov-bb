import { describe, expect, it } from 'vitest'
import {
  buildFunnelSteps,
  humanizeStep,
  shapeFlow,
  shapeFormList,
  shapeFunnel,
  shapeSteps,
  shapeSubmitError,
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

describe('shapeSteps (#1915 reached vs completed)', () => {
  const steps = [
    { stepId: 'a', title: 'Your details' },
    { stepId: 'b', title: 'Eligibility' },
    { stepId: 'c', title: 'Upload docs' },
  ]

  it('derives completed = next step reached, abandoned = reached − completed', () => {
    const out = shapeSteps(steps, { a: 420, b: 310, c: 260 })
    expect(out[0]).toMatchObject({
      title: 'Your details',
      reached: 420,
      completed: 310,
      abandoned: 110,
    })
    expect(out[1]).toMatchObject({
      reached: 310,
      completed: 260,
      abandoned: 50,
    })
    // last step has no successor → fully completed, zero abandoned
    expect(out[2]).toMatchObject({ reached: 260, completed: 260, abandoned: 0 })
  })

  it('treats a missing step count as zero and never returns negative abandoned', () => {
    const out = shapeSteps(steps, { a: 5, c: 9 })
    expect(out[0]).toMatchObject({ reached: 5, completed: 0, abandoned: 5 })
    expect(out[1]).toMatchObject({ reached: 0, completed: 9, abandoned: 0 })
  })
})

describe('shapeFormList (per-form starts + completion)', () => {
  it('derives starts, completions and completion% per form from event counts', () => {
    const forms = [
      { formId: 'a', title: 'Form A' },
      { formId: 'b', title: 'Form B' },
    ]
    const events = [
      { x: 'a:form-start', y: 200 },
      { x: 'a:form-submit', y: 50 },
      { x: 'a:form-step-view', y: 999 },
      { x: 'b:form-start', y: 0 },
    ]
    const out = shapeFormList(forms, events)
    expect(out[0]).toMatchObject({
      formId: 'a',
      starts: 200,
      completions: 50,
      completionPct: 25,
    })
    // no starts → 0% (not NaN/Infinity)
    expect(out[1]).toMatchObject({
      starts: 0,
      completions: 0,
      completionPct: 0,
    })
  })
})

describe('humanizeStep', () => {
  it('labels paths, the home path, and form-start events', () => {
    expect(
      humanizeStep('/family-birth-relationships/get-birth-certificate'),
    ).toBe('Get birth certificate')
    expect(humanizeStep('/')).toBe('Home')
    expect(humanizeStep('get-birth-certificate:form-start')).toBe('Start')
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
    // Both forms' `form-start` merge into ONE "Start" node at column 2.
    const col2 = flow.nodes.filter((n) => n.column === 2)
    expect(col2.length).toBe(1)
    expect(col2[0].label).toBe('Start')
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
