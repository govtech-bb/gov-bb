import { describe, it, expect } from 'vitest'
import {
  avgWeeklyFromSimple,
  calculateSeverance,
  ceilingFor,
  completeYears,
  tieredWeeks,
  Employment,
  PayPeriod,
  Reason,
} from './compute.ts'
import type { SeveranceInputs } from './compute.ts'

describe('completeYears', () => {
  it('returns full years between dates', () => {
    expect(completeYears('2010-01-01', '2020-01-01')).toBe(10)
  })
  it('does not count partial year', () => {
    expect(completeYears('2010-06-01', '2020-05-31')).toBe(9)
  })
  it('returns 0 when end <= start', () => {
    expect(completeYears('2020-01-01', '2020-01-01')).toBe(0)
    expect(completeYears('2020-06-01', '2019-01-01')).toBe(0)
  })
})

describe('tieredWeeks', () => {
  it('0 years -> 0 weeks', () => expect(tieredWeeks(0)).toBe(0))
  it('1 year -> 2.5 weeks', () => expect(tieredWeeks(1)).toBe(2.5))
  it('10 years -> 25 weeks', () => expect(tieredWeeks(10)).toBe(25))
  it('11 years -> 28 weeks (25 + 3)', () => expect(tieredWeeks(11)).toBe(28))
  it('20 years -> 55 weeks', () => expect(tieredWeeks(20)).toBe(55))
  it('21 years -> 58.5 weeks', () => expect(tieredWeeks(21)).toBe(58.5))
  it('33 years -> max counted', () => expect(tieredWeeks(33)).toBe(100.5))
  it('caps at 33 years', () => expect(tieredWeeks(40)).toBe(tieredWeeks(33)))
})

describe('avgWeeklyFromSimple', () => {
  it('returns weekly amount unchanged when under ceiling', () => {
    expect(avgWeeklyFromSimple(900, PayPeriod.Weekly, 2025)).toEqual({
      weekly: 900,
      ceilingApplied: false,
    })
  })
  it('converts monthly to weekly', () => {
    expect(
      avgWeeklyFromSimple(4000, PayPeriod.Monthly, 2025).weekly,
    ).toBeCloseTo((4000 * 12) / 52)
  })
  it('caps at insurable ceiling for end year', () => {
    const result = avgWeeklyFromSimple(2000, PayPeriod.Weekly, 2025)
    expect(result.ceilingApplied).toBe(true)
    expect(result.weekly).toBe(1219)
  })
  it('returns zero for non-positive amounts', () => {
    expect(avgWeeklyFromSimple(0, PayPeriod.Weekly, 2025).weekly).toBe(0)
    expect(avgWeeklyFromSimple(-5, PayPeriod.Weekly, 2025).weekly).toBe(0)
  })
})

describe('ceilingFor', () => {
  it('returns ceiling for known year', () => {
    expect(ceilingFor(2025)).toEqual({ weekly: 1219, monthly: 5280 })
  })
  it('returns null for unknown year', () => {
    expect(ceilingFor(1999)).toBeNull()
  })
})

describe('calculateSeverance', () => {
  const base: SeveranceInputs = {
    employment: Employment.No,
    reason: Reason.Redundancy,
    startIso: '2010-01-01',
    endIso: '2020-01-01',
    period: PayPeriod.Weekly,
    simpleAvg: 1000,
  }

  it('eligible: 10 yrs @ $1000/wk = $25,000', () => {
    const r = calculateSeverance(base)
    expect(r.kind).toBe('eligible')
    if (r.kind !== 'eligible') return
    expect(r.years).toBe(10)
    expect(r.entitledWeeks).toBe(25)
    expect(r.avgWeekly).toBe(1000)
    expect(r.severance).toBe(25_000)
    expect(r.ceilingApplied).toBeNull()
  })

  it('ineligible: self-employed', () => {
    const r = calculateSeverance({ ...base, employment: Employment.Yes })
    expect(r).toEqual({ kind: 'ineligible', reason: 'self-employed' })
  })

  it('ineligible: reason other', () => {
    const r = calculateSeverance({ ...base, reason: Reason.Other })
    expect(r).toEqual({ kind: 'ineligible', reason: 'reason-not-covered' })
  })

  it('ineligible: under two years (less than full first year)', () => {
    const r = calculateSeverance({
      ...base,
      startIso: '2019-06-01',
      endIso: '2020-01-01',
    })
    expect(r).toEqual({ kind: 'ineligible', reason: 'under-two-years' })
  })

  it('ineligible: under two years (one complete year but not two)', () => {
    const r = calculateSeverance({
      ...base,
      startIso: '2018-06-01',
      endIso: '2020-01-01',
    })
    expect(r).toEqual({ kind: 'ineligible', reason: 'under-two-years' })
  })

  it('eligible at the 2-year boundary', () => {
    const r = calculateSeverance({
      ...base,
      startIso: '2018-01-01',
      endIso: '2020-01-01',
    })
    expect(r.kind).toBe('eligible')
    if (r.kind !== 'eligible') return
    expect(r.years).toBe(2)
  })

  it('ceiling applied for high earners ending 2025', () => {
    const r = calculateSeverance({
      ...base,
      endIso: '2025-01-01',
      simpleAvg: 5000,
    })
    if (r.kind !== 'eligible') throw new Error('expected eligible')
    expect(r.avgWeekly).toBe(1219)
    expect(r.ceilingApplied).toEqual({ weekly: 1219, monthly: 5280 })
  })
})
