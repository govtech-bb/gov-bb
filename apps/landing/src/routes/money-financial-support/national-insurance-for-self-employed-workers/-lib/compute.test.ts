import { describe, it, expect } from 'vitest'
import {
  annualIncome,
  earningsAtRisk,
  estimateBenefits,
  goodMonthsValue,
  monthlyAverage,
  monthlyInsurableFromContribution,
  NIS,
  suggestedContributions,
  Tier,
  weeklyInsurableFromMonthly,
} from './compute.ts'
import type { EarningsInputs } from './compute.ts'

const seasonal: EarningsInputs = {
  goodMonth: 4000,
  slowMonth: 2000,
  goodMonthsPerYear: 8,
}

describe('goodMonthsValue', () => {
  it('accepts a whole number in range', () => {
    expect(goodMonthsValue(8)).toBe(8)
    expect(goodMonthsValue(1)).toBe(1)
    expect(goodMonthsValue(12)).toBe(12)
  })
  it('falls back to 6 for out-of-range or non-integer input', () => {
    expect(goodMonthsValue(0)).toBe(6)
    expect(goodMonthsValue(13)).toBe(6)
    expect(goodMonthsValue(1.5)).toBe(6)
    expect(goodMonthsValue(Number.NaN)).toBe(6)
  })
})

describe('annualIncome / monthlyAverage', () => {
  it('weights good and slow months by the seasonality split', () => {
    // 4000×8 + 2000×4 = 40,000
    expect(annualIncome(seasonal)).toBe(40_000)
    expect(monthlyAverage(seasonal)).toBeCloseTo(3333.33, 2)
  })
})

describe('suggestedContributions', () => {
  it('derives moderate/stronger from the monthly average, rounded to $10', () => {
    // monthlyAvg ≈ 3333.33 → moderate 10% ≈ 330, stronger 15% ≈ 500
    expect(suggestedContributions(seasonal)).toEqual({
      minimum: 100,
      moderate: 330,
      stronger: 500,
    })
  })
  it('applies the tier floors for low earners', () => {
    const low: EarningsInputs = {
      goodMonth: 1000,
      slowMonth: 500,
      goodMonthsPerYear: 6,
    }
    // monthlyAvg = 750 → 10% = 75 (< 150 floor), 15% = 112.5 (< 225 floor)
    expect(suggestedContributions(low)).toEqual({
      minimum: 100,
      moderate: 150,
      stronger: 225,
    })
  })
})

describe('monthlyInsurableFromContribution', () => {
  it('derives insurable earnings from the contribution and rate', () => {
    // 1200 / 0.1725 / 12
    expect(monthlyInsurableFromContribution(1200)).toBeCloseTo(579.71, 2)
  })
  it('caps at the monthly insurable ceiling', () => {
    expect(monthlyInsurableFromContribution(36_000)).toBe(
      NIS.MAX_MONTHLY_INSURABLE,
    )
  })
})

describe('weeklyInsurableFromMonthly', () => {
  it('spreads a monthly amount across 52 weeks', () => {
    expect(weeklyInsurableFromMonthly(5360)).toBeCloseTo(1236.92, 2)
  })
})

describe('estimateBenefits', () => {
  it('minimum tier: benefits are shares of insurable earnings', () => {
    const b = estimateBenefits(seasonal, Tier.Minimum)
    expect(b.monthlyContribution).toBe(100)
    expect(b.annualContribution).toBe(1200)
    expect(b.monthlyInsurable).toBeCloseTo(579.71, 2)
    expect(b.weeklyInsurable).toBeCloseTo(133.78, 2)
    expect(b.sicknessWeekly).toBeCloseTo(89.19, 2) // 2/3
    expect(b.maternityWeekly).toBeCloseTo(133.78, 2) // 100%
    expect(b.paternityWeekly).toBeCloseTo(133.78, 2) // 100%
    // 40% of 133.78 = 53.51, below the weekly floor, so the floor wins.
    expect(b.invalidityWeekly).toBe(NIS.INVALIDITY_MIN_WEEKLY)
    expect(b.pensionWeekly).toBeCloseTo(53.51, 2)
    expect(b.survivorsWeekly).toBeCloseTo(53.51, 2)
    expect(b.funeralGrant).toBe(2220)
    expect(b.childGrant).toBe(1280)
  })

  it('high earnings: insurable is capped and invalidity clears its floor', () => {
    const high: EarningsInputs = {
      goodMonth: 20_000,
      slowMonth: 20_000,
      goodMonthsPerYear: 12,
    }
    const b = estimateBenefits(high, Tier.Stronger)
    expect(b.monthlyContribution).toBe(3000) // 15% of 20,000
    expect(b.monthlyInsurable).toBe(NIS.MAX_MONTHLY_INSURABLE)
    expect(b.weeklyInsurable).toBeCloseTo(1236.92, 2)
    expect(b.sicknessWeekly).toBeCloseTo(824.62, 2)
    expect(b.invalidityWeekly).toBeCloseTo(494.77, 2) // above the floor
  })
})

describe('earningsAtRisk', () => {
  it('derives the "without NIS" loss figures from earnings', () => {
    const r = earningsAtRisk(seasonal)
    // Weighted monthly average (40,000 / 12 = 3333.33) halved for two weeks.
    expect(r.twoWeeksLost).toBe(1667)
    expect(r.yearLost).toBe(40_000)
  })
})
