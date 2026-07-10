import { describe, expect, it } from 'vitest'
import { buildFunnelSteps, shapeFormDetail } from './umami-server'

describe('buildFunnelSteps', () => {
  it('builds start→review→submit event steps for a formId', () => {
    expect(buildFunnelSteps('birth-cert')).toEqual([
      { type: 'event', value: 'birth-cert:form-start' },
      { type: 'event', value: 'birth-cert:form-review' },
      { type: 'event', value: 'birth-cert:form-submit' },
    ])
  })
})

describe('shapeFormDetail', () => {
  it('maps funnel rows to stages with dropoff percentages and computes error rate', () => {
    const detail = shapeFormDetail(
      [
        { type: 'event', value: 'f:form-start', visitors: 100, dropoff: null },
        {
          type: 'event',
          value: 'f:form-review',
          visitors: 60,
          dropped: 40,
          dropoff: 0.4,
        },
        {
          type: 'event',
          value: 'f:form-submit',
          visitors: 45,
          dropped: 15,
          dropoff: 0.25,
        },
      ],
      [{ items: ['/', '/f'], count: 10 }],
      { starts: 100, errors: 9 },
    )
    expect(detail.funnel.map((s) => s.label)).toEqual([
      'Start',
      'Review',
      'Submit',
    ])
    expect(detail.funnel[0].dropoffPct).toBe(0)
    expect(detail.funnel[1].dropoffPct).toBe(40)
    expect(detail.submitErrorRate).toBeCloseTo(0.09)
    expect(detail.journey[0].count).toBe(10)
  })

  it('returns a null error rate when there are no starts', () => {
    const detail = shapeFormDetail([], [], { starts: 0, errors: 0 })
    expect(detail.submitErrorRate).toBeNull()
  })
})
