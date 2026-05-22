import { describe, it, expect } from 'vitest'
import {
  easterSunday,
  nthWeekdayOfMonth,
  getBankHolidaysForYear,
} from './bank-holidays'
import type { Holiday } from './bank-holidays'

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('easterSunday', () => {
  it('returns known Easter dates (anonymous Gregorian algorithm)', () => {
    expect(iso(easterSunday(2024))).toBe('2024-03-31')
    expect(iso(easterSunday(2025))).toBe('2025-04-20')
    expect(iso(easterSunday(2026))).toBe('2026-04-05')
  })
})

describe('nthWeekdayOfMonth', () => {
  it('returns the first Monday of August for Kadooment Day', () => {
    // 1 Aug 2024 is a Thursday; first Monday is 5 Aug.
    expect(iso(nthWeekdayOfMonth(2024, 7, 1, 1))).toBe('2024-08-05')
    // 1 Aug 2026 is a Saturday; first Monday is 3 Aug.
    expect(iso(nthWeekdayOfMonth(2026, 7, 1, 1))).toBe('2026-08-03')
  })
})

describe('getBankHolidaysForYear', () => {
  const byName = (name: string) => (h: Holiday) => h.name === name
  const substitutesIn = (year: number) =>
    getBankHolidaysForYear(year).filter((h) => h.substitute)

  it('returns 12 statutory holidays with no substitutes when none fall on the trigger day', () => {
    // 2026: none of the substitution-triggering dates fall on Sunday (and
    // 1 Aug 2026 is a Saturday).
    const list = getBankHolidaysForYear(2026)
    expect(list).toHaveLength(12)
    expect(list.every((h) => !h.substitute)).toBe(true)
  })

  it("adds a Monday-in-lieu when New Year's Day falls on a Sunday", () => {
    // 1 Jan 2023 is a Sunday.
    const subs = substitutesIn(2023)
    expect(subs).toHaveLength(1)
    expect(subs[0].name).toBe("Public Holiday in lieu of New Year's Day")
    expect(iso(subs[0].date)).toBe('2023-01-02')
  })

  it('adds a Tuesday-in-lieu when Emancipation Day (1 Aug) falls on a Sunday', () => {
    // 1 Aug 2021 is a Sunday.
    const subs = substitutesIn(2021).filter(
      byName('Public Holiday in lieu of Emancipation Day'),
    )
    expect(subs).toHaveLength(1)
    expect(iso(subs[0].date)).toBe('2021-08-03')
  })

  it('adds a Tuesday-in-lieu when Emancipation Day (1 Aug) falls on a Monday', () => {
    // 1 Aug 2022 is a Monday.
    const subs = substitutesIn(2022).filter(
      byName('Public Holiday in lieu of Emancipation Day'),
    )
    expect(subs).toHaveLength(1)
    expect(iso(subs[0].date)).toBe('2022-08-02')
  })

  it('adds a Tuesday-in-lieu when Christmas Day falls on a Sunday', () => {
    // 25 Dec 2022 is a Sunday.
    const subs = substitutesIn(2022).filter(
      byName('Public Holiday in lieu of Christmas Day'),
    )
    expect(subs).toHaveLength(1)
    expect(iso(subs[0].date)).toBe('2022-12-27')
  })

  it('handles a year with multiple substitutions (2022)', () => {
    // 2022: Labour Day (1 May) Sun → Mon, Emancipation Day (1 Aug) Mon → Tue,
    // Christmas Day (25 Dec) Sun → Tue. Boxing Day (26 Dec) is Monday — not
    // Sunday, so no substitute fires.
    const list = getBankHolidaysForYear(2022)
    expect(list).toHaveLength(15)

    const subs = list.filter((h) => h.substitute)
    expect(subs.map((h) => h.name).sort()).toEqual([
      'Public Holiday in lieu of Christmas Day',
      'Public Holiday in lieu of Emancipation Day',
      'Public Holiday in lieu of Labour Day',
    ])
  })

  it('returns holidays sorted by date ascending', () => {
    const list = getBankHolidaysForYear(2022)
    for (let i = 1; i < list.length; i++) {
      expect(list[i].date.getTime()).toBeGreaterThanOrEqual(
        list[i - 1].date.getTime(),
      )
    }
  })
})
