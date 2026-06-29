export const Reason = {
  Redundancy: 'redundancy',
  Disaster: 'disaster',
  Layoff: 'layoff',
  Death: 'death',
  Closure: 'closure',
  Other: 'other',
} as const
export type Reason = (typeof Reason)[keyof typeof Reason]

export const ReasonLabel: Record<Reason, string> = {
  [Reason.Redundancy]: 'My job was cut or made redundant',
  [Reason.Disaster]:
    'A fire, flood, hurricane, or other disaster damaged the workplace',
  [Reason.Layoff]: 'I was laid off (period of 6 months)',
  [Reason.Death]: 'Death of employer',
  [Reason.Closure]: 'Business closure or reconstruction',
  [Reason.Other]: 'None of these',
}

export const PayPeriod = { Weekly: 'weekly', Monthly: 'monthly' } as const
export type PayPeriod = (typeof PayPeriod)[keyof typeof PayPeriod]

export const Employment = { Yes: 'yes', No: 'no' } as const
export type Employment = (typeof Employment)[keyof typeof Employment]

export interface SeveranceInputs {
  employment: Employment
  reason: Reason
  startIso: string
  endIso: string
  period: PayPeriod
  simpleAvg: number
}

type IneligibleReason =
  | 'self-employed'
  | 'reason-not-covered'
  | 'under-two-years'

type SeveranceResult =
  | { kind: 'ineligible'; reason: IneligibleReason }
  | {
      kind: 'eligible'
      years: number
      avgWeekly: number
      entitledWeeks: number
      severance: number
      ceilingApplied: { weekly: number; monthly: number } | null
    }

const INSURABLE_CEILINGS = {
  2026: { weekly: 1238, monthly: 5360 },
  2025: { weekly: 1219, monthly: 5280 },
  2024: { weekly: 1201, monthly: 5200 },
  2023: { weekly: 1182, monthly: 5120 },
  2022: { weekly: 1126, monthly: 4880 },
  2021: { weekly: 1128, monthly: 4880 },
  2020: { weekly: 1128, monthly: 4880 },
  2019: { weekly: 1112, monthly: 4820 },
  2018: { weekly: 1073, monthly: 4650 },
  2017: { weekly: 1073, monthly: 4650 },
  2016: { weekly: 1060, monthly: 4360 },
  2015: { weekly: 1060, monthly: 4360 },
} as const satisfies Record<number, { weekly: number; monthly: number }>

type CeilingYear = keyof typeof INSURABLE_CEILINGS

const MAX_YEARS_COUNTED = 33
const TIER_BOUNDARIES = { tier1: 10, tier2: 20, tier3: 33 } as const
const WEEKS_PER_YEAR = { tier1: 2.5, tier2: 3.0, tier3: 3.5 } as const

function isCeilingYear(year: number): year is CeilingYear {
  return year in INSURABLE_CEILINGS
}

export function ceilingFor(
  year: number,
): { weekly: number; monthly: number } | null {
  if (!isCeilingYear(year)) return null
  return INSURABLE_CEILINGS[year]
}

export function completeYears(startIso: string, endIso: string): number {
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) {
    return 0
  }
  let years = e.getFullYear() - s.getFullYear()
  const anniversary = new Date(e.getFullYear(), s.getMonth(), s.getDate())
  if (e < anniversary) years--
  return Math.max(years, 0)
}

export function avgWeeklyFromSimple(
  amount: number,
  period: PayPeriod,
  endYear: number | null,
): { weekly: number; ceilingApplied: boolean } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { weekly: 0, ceilingApplied: false }
  }
  const weekly = period === PayPeriod.Monthly ? (amount * 12) / 52 : amount
  const ceiling = endYear !== null ? ceilingFor(endYear) : null
  if (ceiling && weekly > ceiling.weekly) {
    return { weekly: ceiling.weekly, ceilingApplied: true }
  }
  return { weekly, ceilingApplied: false }
}

export function tieredWeeks(yearsOfService: number): number {
  const counted = Math.min(Math.max(yearsOfService, 0), MAX_YEARS_COUNTED)
  let weeks = 0
  for (let i = 1; i <= counted; i++) {
    weeks +=
      i <= TIER_BOUNDARIES.tier1
        ? WEEKS_PER_YEAR.tier1
        : i <= TIER_BOUNDARIES.tier2
          ? WEEKS_PER_YEAR.tier2
          : WEEKS_PER_YEAR.tier3
  }
  return weeks
}

export function calculateSeverance(input: SeveranceInputs): SeveranceResult {
  if (input.employment === Employment.Yes) {
    return { kind: 'ineligible', reason: 'self-employed' }
  }
  if (input.reason === Reason.Other) {
    return { kind: 'ineligible', reason: 'reason-not-covered' }
  }

  const years = completeYears(input.startIso, input.endIso)
  if (years < 2) {
    return { kind: 'ineligible', reason: 'under-two-years' }
  }

  const endYear = Number.parseInt(input.endIso.slice(0, 4), 10)
  const { weekly: avgWeekly, ceilingApplied } = avgWeeklyFromSimple(
    input.simpleAvg,
    input.period,
    Number.isFinite(endYear) ? endYear : null,
  )
  const entitledWeeks = tieredWeeks(years)
  const severance = avgWeekly * entitledWeeks
  const ceiling = ceilingApplied ? ceilingFor(endYear) : null

  return {
    kind: 'eligible',
    years,
    avgWeekly,
    entitledWeeks,
    severance,
    ceilingApplied: ceiling,
  }
}
