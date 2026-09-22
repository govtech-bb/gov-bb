import { describe, expect, it } from 'vitest'
import { MAX_YEAR, MIN_YEAR } from './dates'
import { BANK_HOLIDAY_RULES } from './holiday-rules'
import { holidaysForYear } from './holidays'
import { referenceHolidaysForYear } from './holidays-reference'

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('the rule engine against the original generator', () => {
  // The whole point of moving the holiday list out of code and into editable
  // rows is that it changes nothing. Pin it for every year in range.
  for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
    it(`matches ${year} exactly`, () => {
      const computed = holidaysForYear(BANK_HOLIDAY_RULES, year, 'cap-352')
      const reference = referenceHolidaysForYear(year)

      expect(computed.map((h) => [iso(h.date), h.name])).toEqual(
        reference.map((h) => [iso(h.date), h.name]),
      )
      expect(computed).toEqual(reference)
    })
  }
})

describe('the dates the acceptance criteria name', () => {
  const on = (year: number, name: string) =>
    iso(
      holidaysForYear(BANK_HOLIDAY_RULES, year).find((h) => h.name === name)!
        .date,
    )

  it('computes Good Friday for 2020, 2026 and 2050', () => {
    expect(on(2020, 'Good Friday')).toBe('2020-04-10')
    expect(on(2026, 'Good Friday')).toBe('2026-04-03')
    expect(on(2050, 'Good Friday')).toBe('2050-04-08')
  })

  it('computes Easter Monday for 2020, 2026 and 2050', () => {
    expect(on(2020, 'Easter Monday')).toBe('2020-04-13')
    expect(on(2026, 'Easter Monday')).toBe('2026-04-06')
    expect(on(2050, 'Easter Monday')).toBe('2050-04-11')
  })

  it('computes Kadooment Day — first Monday of August', () => {
    for (const year of [2020, 2026, 2050]) {
      const date = holidaysForYear(BANK_HOLIDAY_RULES, year).find(
        (h) => h.name === 'Kadooment Day',
      )!.date
      expect(date.getUTCMonth()).toBe(7)
      expect(date.getUTCDay()).toBe(1)
      expect(date.getUTCDate()).toBeLessThanOrEqual(7)
    }
  })
})

describe('substitution policy', () => {
  it('applies Cap. 352 (a) — New Year on a Sunday moves to the Monday', () => {
    // 1 January 2023 was a Sunday.
    const holidays = holidaysForYear(BANK_HOLIDAY_RULES, 2023)
    const lieu = holidays.find((h) => h.name.includes("lieu of New Year's Day"))
    expect(lieu && iso(lieu.date)).toBe('2023-01-02')
  })

  it('applies Cap. 352 (b) — Emancipation Day on a Monday moves to Tuesday', () => {
    // 1 August 2022 was a Monday.
    const lieu = holidaysForYear(BANK_HOLIDAY_RULES, 2022).find((h) =>
      h.name.includes('lieu of Emancipation Day'),
    )
    expect(lieu && iso(lieu.date)).toBe('2022-08-02')
  })

  it('applies Cap. 352 (c) — Christmas on a Sunday moves to Tuesday', () => {
    // 25 December 2022 was a Sunday.
    const lieu = holidaysForYear(BANK_HOLIDAY_RULES, 2022).find((h) =>
      h.name.includes('lieu of Christmas Day'),
    )
    expect(lieu && iso(lieu.date)).toBe('2022-12-27')
  })

  it('emits no substitutes at all under the "none" policy', () => {
    const holidays = holidaysForYear(BANK_HOLIDAY_RULES, 2023, 'none')
    expect(holidays.filter((h) => h.substitute)).toHaveLength(0)
    expect(holidays).toHaveLength(BANK_HOLIDAY_RULES.length)
  })

  it('"next-working-day" differs from Cap. 352 — it also moves Saturdays', () => {
    // 1 January 2022 was a Saturday: Cap. 352 grants nothing, the naive
    // policy moves it to the Monday. This is what makes the block field
    // visibly meaningful in the editor.
    const cap352 = holidaysForYear(BANK_HOLIDAY_RULES, 2022, 'cap-352')
    const naive = holidaysForYear(BANK_HOLIDAY_RULES, 2022, 'next-working-day')
    expect(cap352.some((h) => h.name.includes("lieu of New Year's Day"))).toBe(
      false,
    )
    const lieu = naive.find((h) => h.name.includes("lieu of New Year's Day"))
    expect(lieu && iso(lieu.date)).toBe('2022-01-03')
  })
})
