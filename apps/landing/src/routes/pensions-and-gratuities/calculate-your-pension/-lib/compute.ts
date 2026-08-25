export interface PensionInputs {
  /** Month pensionable service started, 1 (January) to 12 (December). */
  startMonth: number
  startYear: number
  /** Month pensionable service stopped, 1 (January) to 12 (December). */
  endMonth: number
  endYear: number
  /** Months of no-pay leave to deduct from pensionable service. */
  nopayMonths: number
  salary: number
}

export interface PensionEstimate {
  months: number
  startMonth: number
  startYear: number
  endMonth: number
  endYear: number
  nopayMonths: number
  salary: number
  fullAnnual: number
  fullMonthly: number
  reducedAnnual: number
  reducedMonthly: number
  gratuity: number
  serviceWarning: boolean
}

export const SERVICE_WARNING_MONTHS = 120

/**
 * Pensionable service is capped at 600 months (50 years): at 600 months the
 * full annual pension already equals the last salary, so uncapped service would
 * produce an impossible pension above 100% of salary.
 */
export const MAX_PENSIONABLE_MONTHS = 600

/** A year+month expressed as a single month index, so spans can be subtracted. */
function absoluteMonths(year: number, month: number): number {
  return year * 12 + month
}

/**
 * Elapsed months of pensionable service from the start month/year up to the
 * stop month/year, less no-pay leave. Using the months (not just the years)
 * means a mid-year start or stop is counted from that month rather than
 * assuming the whole calendar year was worked.
 */
export function grossMonths(input: PensionInputs): number {
  return (
    absoluteMonths(input.endYear, input.endMonth) -
    absoluteMonths(input.startYear, input.startMonth) -
    input.nopayMonths
  )
}

export function calculatePension(input: PensionInputs): PensionEstimate {
  const { startMonth, startYear, endMonth, endYear, nopayMonths, salary } =
    input
  // Clamp to [0, 600]: the upper cap stops a wide range yielding a pension
  // above 100% of salary; the lower bound of 0 keeps the function safe if a
  // caller passes no-pay leave that exceeds gross service.
  const months = Math.max(
    0,
    Math.min(grossMonths(input), MAX_PENSIONABLE_MONTHS),
  )
  const fullAnnual = (months / MAX_PENSIONABLE_MONTHS) * salary
  const reducedAnnual = fullAnnual * 0.75
  return {
    months,
    startMonth,
    startYear,
    endMonth,
    endYear,
    nopayMonths,
    salary,
    fullAnnual,
    fullMonthly: fullAnnual / 12,
    reducedAnnual,
    reducedMonthly: reducedAnnual / 12,
    gratuity: (fullAnnual / 4) * 12.5,
    serviceWarning: months < SERVICE_WARNING_MONTHS,
  }
}
