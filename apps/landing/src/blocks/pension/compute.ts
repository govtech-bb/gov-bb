export interface PensionInputs {
  months: number;
  salary: number;
}

export interface PensionEstimate {
  months: number;
  salary: number;
  fullAnnual: number;
  fullMonthly: number;
  reducedAnnual: number;
  reducedMonthly: number;
  gratuity: number;
  serviceWarning: boolean;
}

export const SERVICE_WARNING_MONTHS = 120;

export function calculatePension(input: PensionInputs): PensionEstimate {
  const { months, salary } = input;
  const fullAnnual = (months / 600) * salary;
  const reducedAnnual = fullAnnual * 0.75;
  return {
    months,
    salary,
    fullAnnual,
    fullMonthly: fullAnnual / 12,
    reducedAnnual,
    reducedMonthly: reducedAnnual / 12,
    gratuity: (fullAnnual / 4) * 12.5,
    serviceWarning: months < SERVICE_WARNING_MONTHS,
  };
}
