/**
 * An independent check of the holiday calculation against the Public Holidays
 * Act, Cap. 352: bank-holidays-golden.fixture.json holds the Barbados holidays
 * for 2020 to 2050 from python `holidays` (vacanza/holidays; the version is
 * in the fixture's `source`, the generator is generate-bank-holidays-golden.py).
 * Python `holidays` was chosen because npm `date-holidays` and the Nager.Date
 * API both lack Cap. 352's substitution days (62 and 41 differences over
 * 2020 to 2050). Dates only: the names differ by design (its "May Day" is our
 * "Labour Day", its "(observed)" days our "in lieu" ones).
 */
import { describe, expect, it } from 'vitest'
import { getBankHolidaysForYear, MAX_YEAR, MIN_YEAR } from './bank-holidays'
import golden from './bank-holidays-golden.fixture.json'
import { holidaysForYear, oneOffHolidays } from './public-holidays'
import type { Holiday } from './bank-holidays'

const statutory = golden.statutory as Record<string, Array<string>>

/** The distinct ISO dates of a list of holidays, sorted. */
const dates = (holidays: Array<Holiday>) =>
  [...new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)))].sort()

const years = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, i) => MIN_YEAR + i,
)

describe('golden holidays (python holidays, Cap. 352)', () => {
  it('covers every year the calendar shows', () => {
    expect(Object.keys(statutory).map(Number)).toEqual(years)
  })

  it.each(years)('calculates the statutory dates for %i', (year) => {
    expect(dates(getBankHolidaysForYear(year))).toEqual(
      [...statutory[year]].sort(),
    )
  })

  it.each([2021, 2023])(
    'with the declared one-off holidays, gives the full set for %i',
    (year) => {
      const records = golden.oneOff.map(({ date, name }) => ({
        data: { date, name },
      }))
      const declared = golden.oneOff
        .map(({ date }) => date)
        .filter((date) => date.startsWith(`${year}-`))
      expect(declared.length).toBeGreaterThan(0)
      expect(dates(holidaysForYear(year, oneOffHolidays(records)))).toEqual(
        [...statutory[year], ...declared].sort(),
      )
    },
  )
})
