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

export function calculatePension(input: PensionInputs): PensionEstimate {
  const { startYear, endYear, nopayMonths, salary } = input
  // Service is taken as entered (matching the prototype). Lower-bound at 0 so
  // no-pay leave exceeding gross service can never produce a negative pension.
  const months = Math.max(0, (endYear - startYear) * 12 - nopayMonths)
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
