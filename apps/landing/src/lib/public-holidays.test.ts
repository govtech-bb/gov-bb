import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiV2Breaker } from './api-v2-reader'
import { getBankHolidaysForYear, MAX_YEAR, MIN_YEAR } from './bank-holidays'
import {
  holidaysForYear,
  lastUpdated,
  oneOffHolidays,
  parseIsoDate,
  resolvePublicHolidays,
} from './public-holidays'

const BASE = 'http://api.example'
const iso = (d: Date) => d.toISOString().slice(0, 10)

const FINAL = {
  key: '2027-03-15-cricket-world-cup-final',
  name: 'Cricket World Cup Final',
  date: '2027-03-15',
  note: 'Declared by the Government',
}

/** Records as api_v2 sends them, by their data alone. */
const rows = (...data: Array<Record<string, string>>) =>
  data.map((row) => ({ data: row }))

const records = (...data: Array<Record<string, string>>) => ({
  collection: {
    key: 'public-holidays',
    title: 'Public holidays',
    record_key: 'key',
    schema: {
      fields: [
        { key: 'key', label: 'Key', type: 'slug' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text' },
        { key: 'note', label: 'Note', type: 'text' },
      ],
    },
    schema_version: 1,
    updated_at: '2026-11-19T00:00:00.000Z',
  },
  records: data.map((row) => ({
    record_key: row.key,
    data: row,
    updated_at: '2026-11-19T00:00:00.000Z',
  })),
})

function stubFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.restoreAllMocks()
  apiV2Breaker.reset()
})

describe('parseIsoDate', () => {
  it('reads a YYYY-MM-DD date as that UTC day', () => {
    expect(parseIsoDate('2027-03-15')?.toISOString()).toBe(
      '2027-03-15T00:00:00.000Z',
    )
  })

  it.each(['2027-02-30', '2027-13-01', '15/03/2027', '2027-3-15', ''])(
    'is null for %j',
    (value) => {
      expect(parseIsoDate(value)).toBeNull()
    },
  )
})

describe('oneOffHolidays', () => {
  it('keeps a record with a name and a real date, and its note', () => {
    expect(oneOffHolidays(rows(FINAL))).toEqual([
      {
        date: '2027-03-15',
        name: 'Cricket World Cup Final',
        note: 'Declared by the Government',
      },
    ])
  })

  it('ignores a record with an invalid or missing date, or no name', () => {
    expect(
      oneOffHolidays(
        rows(
          { ...FINAL, date: '15 March 2027' },
          { ...FINAL, date: '2027-02-30' },
          { key: 'no-date', name: 'No date' },
          { ...FINAL, name: '  ' },
        ),
      ),
    ).toEqual([])
  })

  it('keeps when the record last changed', () => {
    expect(
      oneOffHolidays([{ data: FINAL, updated_at: '2027-01-02T00:00:00.000Z' }]),
    ).toEqual([
      expect.objectContaining({ updated_at: '2027-01-02T00:00:00.000Z' }),
    ])
  })

  it('leaves out an empty note', () => {
    expect(oneOffHolidays(rows({ ...FINAL, note: ' ' }))).toEqual([
      { date: '2027-03-15', name: 'Cricket World Cup Final' },
    ])
  })
})

describe('lastUpdated', () => {
  const PAGE = new Date(Date.UTC(2026, 4, 5))
  const changed = (updated_at: string) => [
    { date: '2027-03-15', name: 'Cricket World Cup Final', updated_at },
  ]

  it('is the page’s date with no records', () => {
    expect(lastUpdated(PAGE, [])).toEqual(PAGE)
  })

  it('is the page’s date when every record is older', () => {
    expect(lastUpdated(PAGE, changed('2026-01-10T15:00:00.000Z'))).toEqual(PAGE)
  })

  it('is the Barbados day the newest record changed on, when later', () => {
    expect(
      lastUpdated(PAGE, [
        ...changed('2026-09-01T12:00:00.000Z'),
        // 1 March 2027, 02:00 UTC is still 28 February in Barbados.
        ...changed('2027-03-01T02:00:00.000Z'),
        ...changed('not a date'),
      ]),
    ).toEqual(new Date(Date.UTC(2027, 1, 28)))
  })
})

describe('holidaysForYear', () => {
  it('without one-off holidays, gives the calculated dates unchanged', () => {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year++)
      expect(holidaysForYear(year, [])).toEqual(getBankHolidaysForYear(year))
  })

  it('adds a one-off holiday to its year, in date order', () => {
    const holidays = holidaysForYear(2027, oneOffHolidays(rows(FINAL)))
    expect(holidays.map((h) => `${iso(h.date)} ${h.name}`)).toEqual([
      "2027-01-01 New Year's Day",
      '2027-01-21 Errol Barrow Day',
      '2027-03-15 Cricket World Cup Final',
      '2027-03-26 Good Friday',
      '2027-03-29 Easter Monday',
      '2027-04-28 National Heroes Day',
      '2027-05-01 Labour Day',
      '2027-05-17 Whit Monday',
      '2027-08-01 Emancipation Day',
      '2027-08-02 Kadooment Day',
      '2027-08-03 Public Holiday in lieu of Emancipation Day',
      '2027-11-30 Independence Day',
      '2027-12-25 Christmas Day',
      '2027-12-26 Boxing Day',
      '2027-12-27 Public Holiday in lieu of Boxing Day',
    ])
    expect(holidays[2]).toEqual({
      date: new Date(Date.UTC(2027, 2, 15)),
      name: 'Cricket World Cup Final',
      note: 'Declared by the Government',
    })
  })

  it('leaves a one-off holiday out of every other year', () => {
    const oneOffs = oneOffHolidays(rows(FINAL))
    expect(holidaysForYear(2026, oneOffs)).toEqual(getBankHolidaysForYear(2026))
    expect(holidaysForYear(2028, oneOffs)).toEqual(getBankHolidaysForYear(2028))
  })

  it('lists a holiday once when a record repeats it', () => {
    const holidays = holidaysForYear(
      2027,
      oneOffHolidays(
        rows(
          FINAL,
          { ...FINAL, key: 'again' },
          { key: 'christmas', name: 'Christmas Day', date: '2027-12-25' },
        ),
      ),
    )
    expect(holidays).toEqual(holidaysForYear(2027, oneOffHolidays(rows(FINAL))))
  })

  it('gives a one-off holiday on a Sunday no substitution day', () => {
    // 14 March 2027 is a Sunday.
    const holidays = holidaysForYear(
      2027,
      oneOffHolidays(rows({ ...FINAL, date: '2027-03-14' })),
    )
    expect(new Date(Date.UTC(2027, 2, 14)).getUTCDay()).toBe(0)
    expect(holidays).toHaveLength(getBankHolidaysForYear(2027).length + 1)
    expect(holidays.filter((h) => h.substitute).map((h) => h.name)).toEqual(
      getBankHolidaysForYear(2027)
        .filter((h) => h.substitute)
        .map((h) => h.name),
    )
  })
})

describe('resolvePublicHolidays', () => {
  it('reads the public-holidays collection with landing’s token', async () => {
    const fetchImpl = stubFetch(json(200, records(FINAL)))
    expect(await resolvePublicHolidays(BASE, fetchImpl, 'secret')).toEqual([
      {
        date: '2027-03-15',
        name: 'Cricket World Cup Final',
        note: 'Declared by the Government',
        updated_at: '2026-11-19T00:00:00.000Z',
      },
    ])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/collections/public-holidays/records`)
    expect(init.headers).toEqual({ 'x-landing-token': 'secret' })
  })

  it('ignores an invalid record and keeps the rest', async () => {
    const bad = { ...FINAL, key: 'bad', date: 'next Tuesday' }
    expect(
      await resolvePublicHolidays(
        BASE,
        stubFetch(json(200, records(bad, FINAL))),
      ),
    ).toEqual(oneOffHolidays(records(FINAL).records))
  })

  it('is empty, with no request, when api_v2 isn’t configured', async () => {
    const fetchImpl = stubFetch(json(200, records(FINAL)))
    expect(await resolvePublicHolidays(null, fetchImpl)).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('is empty, silently, when the collection is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await resolvePublicHolidays(
        BASE,
        stubFetch(json(404, { error: 'not_found' })),
      ),
    ).toEqual([])
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('is empty when the collection has no records', async () => {
    expect(
      await resolvePublicHolidays(BASE, stubFetch(json(200, records()))),
    ).toEqual([])
  })

  it.each([
    ['a server error', json(500, {})],
    ['a malformed body', json(200, { records: 'no' })],
    ['a network failure', new Error('ECONNREFUSED')],
  ])('is empty on %s', async (_, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await resolvePublicHolidays(BASE, stubFetch(response))).toEqual([])
  })
})
