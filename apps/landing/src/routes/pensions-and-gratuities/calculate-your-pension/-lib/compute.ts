export interface PensionInputs {
  startYear: number
  endYear: number
  /** Months of no-pay leave to deduct from pensionable service. */
  nopayMonths: number
  salary: number
}

export interface PensionEstimate {
  months: number
  startYear: number
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

export function calculatePension(input: PensionInputs): PensionEstimate {
  const { startYear, endYear, nopayMonths, salary } = input
  const months = Math.min(
    (endYear - startYear) * 12 - nopayMonths,
    MAX_PENSIONABLE_MONTHS,
  )
  const fullAnnual = (months / 600) * salary
  const reducedAnnual = fullAnnual * 0.75
  return {
    months,
    startYear,
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
