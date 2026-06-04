import { describe, it, expect } from 'vitest'
import { calculatePension, SERVICE_WARNING_MONTHS } from './compute.ts'

describe('calculatePension', () => {
  it('full pension at 600 months equals last annual salary', () => {
    const r = calculatePension({ months: 600, salary: 100_000 })
    expect(r.fullAnnual).toBe(100_000)
    expect(r.fullMonthly).toBeCloseTo(100_000 / 12)
  })

  it('reduced pension is 75% of full', () => {
    const r = calculatePension({ months: 240, salary: 60_000 })
    expect(r.reducedAnnual).toBeCloseTo(r.fullAnnual * 0.75)
    expect(r.reducedMonthly).toBeCloseTo(r.reducedAnnual / 12)
  })

  it('gratuity is (full annual / 4) * 12.5', () => {
    const r = calculatePension({ months: 360, salary: 80_000 })
    expect(r.gratuity).toBeCloseTo((r.fullAnnual / 4) * 12.5)
  })

  it('flags service warning below 10 years (120 months)', () => {
    expect(
      calculatePension({ months: 119, salary: 50_000 }).serviceWarning,
    ).toBe(true)
    expect(
      calculatePension({ months: SERVICE_WARNING_MONTHS, salary: 50_000 })
        .serviceWarning,
    ).toBe(false)
  })

  it('known case: 240 months @ $60k → $24k annual full', () => {
    const r = calculatePension({ months: 240, salary: 60_000 })
    expect(r.fullAnnual).toBe(24_000)
    expect(r.gratuity).toBe(75_000)
  })
})
