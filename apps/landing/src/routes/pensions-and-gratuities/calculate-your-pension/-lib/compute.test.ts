import { describe, it, expect } from 'vitest'
import { calculatePension, SERVICE_WARNING_MONTHS } from './compute.ts'

describe('calculatePension', () => {
  it('derives months from the service years, less no-pay leave', () => {
    const r = calculatePension({
      startYear: 2000,
      endYear: 2021,
      nopayMonths: 12,
      salary: 60_000,
    })
    // (2021 - 2000) * 12 - 12 = 240
    expect(r.months).toBe(240)
  })

  it('full pension at 600 months equals last annual salary', () => {
    const r = calculatePension({
      startYear: 2000,
      endYear: 2050,
      nopayMonths: 0,
      salary: 100_000,
    })
    expect(r.months).toBe(600)
    expect(r.fullAnnual).toBe(100_000)
    expect(r.fullMonthly).toBeCloseTo(100_000 / 12)
  })

  it('reduced pension is 75% of full', () => {
    const r = calculatePension({
      startYear: 2000,
      endYear: 2020,
      nopayMonths: 0,
      salary: 60_000,
    })
    expect(r.reducedAnnual).toBeCloseTo(r.fullAnnual * 0.75)
    expect(r.reducedMonthly).toBeCloseTo(r.reducedAnnual / 12)
  })

  it('gratuity is (full annual / 4) * 12.5', () => {
    const r = calculatePension({
      startYear: 2000,
      endYear: 2030,
      nopayMonths: 0,
      salary: 80_000,
    })
    expect(r.gratuity).toBeCloseTo((r.fullAnnual / 4) * 12.5)
  })

  it('flags service warning below 10 years (120 months)', () => {
    // 2000 → 2010 is exactly 120 months; 1 month of no-pay leave drops it to 119.
    expect(
      calculatePension({
        startYear: 2000,
        endYear: 2010,
        nopayMonths: 1,
        salary: 50_000,
      }).serviceWarning,
    ).toBe(true)
    expect(
      calculatePension({
        startYear: 2000,
        endYear: 2010,
        nopayMonths: 0,
        salary: 50_000,
      }).serviceWarning,
    ).toBe(false)
    expect(SERVICE_WARNING_MONTHS).toBe(120)
  })

  it('caps pensionable service at 600 months so the pension never exceeds salary', () => {
    // 2000 → 2100 is 1200 months; it must be capped to 600.
    const r = calculatePension({
      startYear: 2000,
      endYear: 2100,
      nopayMonths: 0,
      salary: 100_000,
    })
    expect(r.months).toBe(600)
    expect(r.fullAnnual).toBe(100_000)
  })

  it('never returns a negative pension when no-pay leave exceeds gross service', () => {
    // 5 years = 60 months of service, but 100 months of no-pay leave.
    const r = calculatePension({
      startYear: 2000,
      endYear: 2005,
      nopayMonths: 100,
      salary: 60_000,
    })
    expect(r.months).toBe(0)
    expect(r.fullAnnual).toBe(0)
    expect(r.gratuity).toBe(0)
  })

  it('known case: 240 months @ $60k → $24k annual full, $75k gratuity', () => {
    const r = calculatePension({
      startYear: 2000,
      endYear: 2020,
      nopayMonths: 0,
      salary: 60_000,
    })
    expect(r.fullAnnual).toBe(24_000)
    expect(r.gratuity).toBe(75_000)
  })
})
