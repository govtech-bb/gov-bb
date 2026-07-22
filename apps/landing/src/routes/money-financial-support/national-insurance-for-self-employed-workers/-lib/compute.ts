/**
 * Coverage estimator for self-employed / gig workers contributing to National
 * Insurance (NIS) voluntarily.
 *
 * Ported from the `self-employed-nis` prototype (govtech-bb/self-employed-nis,
 * PR #86, `check.html`). This file re-implements the prototype's "lean
 * estimator" business logic as pure functions; the UI is re-expressed with the
 * GovBB Design System in `../-ui/CoverageCalculator.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNVERIFIED FIGURES — the numbers in `NIS` below are the prototype's
 * placeholders. Every rate, ceiling, minimum and fixed grant must be confirmed
 * by the NIS Self-Employed Unit before this tool leaves `preview`. They are
 * isolated in this one block so a single edit swaps them once NIS signs off.
 * Sources cited by the prototype: nis.gov.bb benefit pages + NISSS meeting
 * 2026-06-02 (self-employed rate 17.25% incl. RNR; benefits are a share of
 * insurable earnings, not of the contribution; max insurable $5,360/month).
 * ─────────────────────────────────────────────────────────────────────────
 */

export const NIS = {
  /** Self-employed contribution rate (includes RNR). */
  SE_RATE: 0.1725,
  /** Most NIS can insure per month; earnings above this do not raise benefits. */
  MAX_MONTHLY_INSURABLE: 5360,
  /** A full year of contributions needs at least this much. */
  MIN_ANNUAL_CONTRIBUTION: 1200,
  // Replacement rates — share of insurable earnings.
  SICKNESS_RATE: 2 / 3, // 66⅔%
  MATERNITY_RATE: 1.0, // 100%
  PATERNITY_RATE: 1.0, // 100%
  INVALIDITY_RATE: 0.4, // 40% of average insurable earnings
  /** Floor for the invalidity pension, per week. */
  INVALIDITY_MIN_WEEKLY: 254,
  // Fixed amounts.
  FUNERAL_GRANT: 2220,
  CHILD_GRANT: 1280,
  // Durations / ages (used in result copy).
  SICKNESS_MAX_WEEKS: 26,
  PATERNITY_WEEKS: 3,
  PENSIONABLE_AGE: 67,
} as const

export const Tier = {
  Minimum: 'minimum',
  Moderate: 'moderate',
  Stronger: 'stronger',
} as const
export type Tier = (typeof Tier)[keyof typeof Tier]

export interface EarningsInputs {
  /** Take-home earnings in a good month (BDS$). */
  goodMonth: number
  /** Take-home earnings in a slow month (BDS$). */
  slowMonth: number
  /** How many good months in a typical year (1–12). */
  goodMonthsPerYear: number
}

export interface BenefitEstimate {
  monthlyContribution: number
  annualContribution: number
  monthlyInsurable: number
  weeklyInsurable: number
  sicknessWeekly: number
  maternityWeekly: number
  paternityWeekly: number
  invalidityWeekly: number
  pensionWeekly: number
  survivorsWeekly: number
  funeralGrant: number
  childGrant: number
}

/**
 * A valid seasonality answer, else a neutral fallback of 6 (half the year).
 * The UI validates 1–12 before this runs; the fallback only covers a
 * programmatic call with a bad value.
 */
export function goodMonthsValue(goodMonthsPerYear: number): number {
  return Number.isInteger(goodMonthsPerYear) &&
    goodMonthsPerYear >= 1 &&
    goodMonthsPerYear <= 12
    ? goodMonthsPerYear
    : 6
}

/** Yearly income implied by the good/slow split. */
export function annualIncome(e: EarningsInputs): number {
  const gm = goodMonthsValue(e.goodMonthsPerYear)
  return e.goodMonth * gm + e.slowMonth * (12 - gm)
}

/** Average monthly income across the year. */
export function monthlyAverage(e: EarningsInputs): number {
  return annualIncome(e) / 12
}

/**
 * Suggested monthly contribution for each tier, derived from average earnings.
 * Minimum is a flat floor; moderate/stronger are a share of the monthly
 * average, rounded to the nearest $10, with their own floors.
 */
export function suggestedContributions(
  e: EarningsInputs,
): Record<Tier, number> {
  const monthlyAvg = monthlyAverage(e)
  return {
    [Tier.Minimum]: 100,
    [Tier.Moderate]: Math.max(150, Math.round((monthlyAvg * 0.1) / 10) * 10),
    [Tier.Stronger]: Math.max(225, Math.round((monthlyAvg * 0.15) / 10) * 10),
  }
}

/** The chosen tier's monthly contribution. */
export function monthlyContributionFor(e: EarningsInputs, tier: Tier): number {
  return suggestedContributions(e)[tier]
}

/** Annual contribution → monthly insurable earnings (capped at the ceiling). */
export function monthlyInsurableFromContribution(
  annualContribution: number,
): number {
  const raw = annualContribution / NIS.SE_RATE / 12
  return Math.min(NIS.MAX_MONTHLY_INSURABLE, raw)
}

/** Monthly insurable earnings → weekly insurable earnings. */
export function weeklyInsurableFromMonthly(monthly: number): number {
  return (monthly * 12) / 52
}

/**
 * The benefit estimate for a chosen contribution tier. Every weekly benefit is
 * a share of insurable earnings, which come from the contribution — not the
 * user's raw earnings — so a bigger contribution buys bigger benefits.
 */
export function estimateBenefits(
  e: EarningsInputs,
  tier: Tier,
): BenefitEstimate {
  const monthlyContribution = monthlyContributionFor(e, tier)
  const annualContribution = monthlyContribution * 12
  const monthlyInsurable = monthlyInsurableFromContribution(annualContribution)
  const weeklyInsurable = weeklyInsurableFromMonthly(monthlyInsurable)

  return {
    monthlyContribution,
    annualContribution,
    monthlyInsurable,
    weeklyInsurable,
    sicknessWeekly: weeklyInsurable * NIS.SICKNESS_RATE,
    maternityWeekly: weeklyInsurable * NIS.MATERNITY_RATE,
    paternityWeekly: weeklyInsurable * NIS.PATERNITY_RATE,
    invalidityWeekly: Math.max(
      NIS.INVALIDITY_MIN_WEEKLY,
      weeklyInsurable * NIS.INVALIDITY_RATE,
    ),
    pensionWeekly: weeklyInsurable * NIS.INVALIDITY_RATE,
    // Survivors' benefit shares the pension-rate amount among dependants.
    survivorsWeekly: weeklyInsurable * NIS.INVALIDITY_RATE,
    funeralGrant: NIS.FUNERAL_GRANT,
    childGrant: NIS.CHILD_GRANT,
  }
}

export interface EarningsAtRisk {
  /**
   * Roughly what two weeks off work costs, from the seasonality-weighted
   * monthly average — consistent with every other figure on the page.
   */
  twoWeeksLost: number
  /** A whole year of earnings — the "without a pension" framing figure. */
  yearLost: number
}

/** The "without NIS" side of the result: earnings the user would lose. */
export function earningsAtRisk(e: EarningsInputs): EarningsAtRisk {
  return {
    twoWeeksLost: Math.round(monthlyAverage(e) / 2),
    yearLost: Math.round(annualIncome(e)),
  }
}
