import { describe, expect, it } from 'vitest'
import type { Pharmacy, WeeklyHours } from '../-data/pharmacies'
import {
  barbadosWallClock,
  dayHoursLabel,
  formatTime,
  formatTimeShort,
  openStatus,
  pharmacyStatus,
  soonestOpening,
  toMinutes,
  weeklyHoursSummary,
} from './opening-hours'

const CLOSED_ALL_WEEK: WeeklyHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
}

const hoursWith = (overrides: Partial<WeeklyHours>): WeeklyHours => ({
  ...CLOSED_ALL_WEEK,
  ...overrides,
})

describe('toMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('08:30')).toBe(510)
    expect(toMinutes('24:00')).toBe(1440)
  })
})

describe('barbadosWallClock', () => {
  // Barbados is fixed at UTC-4 with no daylight saving, so these instants
  // map to the same wall clock forever.
  it('maps a UTC instant to Barbados wall-clock time', () => {
    // 2026-08-19 is a Wednesday; 18:30 UTC = 14:30 in Barbados.
    expect(barbadosWallClock(new Date('2026-08-19T18:30:00Z'))).toEqual({
      weekday: 'wed',
      minutes: 870,
    })
  })

  it('rolls the weekday back across UTC midnight', () => {
    // 03:00 UTC Thursday = 23:00 Wednesday in Barbados.
    expect(barbadosWallClock(new Date('2026-08-20T03:00:00Z'))).toEqual({
      weekday: 'wed',
      minutes: 1380,
    })
  })

  it('handles the local midnight boundary as 0 minutes', () => {
    // 04:00 UTC Thursday = 00:00 Thursday in Barbados.
    expect(barbadosWallClock(new Date('2026-08-20T04:00:00Z'))).toEqual({
      weekday: 'thu',
      minutes: 0,
    })
  })
})

describe('openStatus', () => {
  const STANDARD = hoursWith({
    mon: [{ opens: '08:00', closes: '18:00' }],
  })

  it('is open mid-range with the closing time', () => {
    expect(openStatus(STANDARD, { weekday: 'mon', minutes: 600 })).toEqual({
      open: true,
      closes: '18:00',
    })
  })

  it('is open at the opening minute exactly (inclusive)', () => {
    expect(
      openStatus(STANDARD, { weekday: 'mon', minutes: toMinutes('08:00') }),
    ).toEqual({ open: true, closes: '18:00' })
  })

  it('is closed at the closing minute exactly (exclusive)', () => {
    const status = openStatus(STANDARD, {
      weekday: 'mon',
      minutes: toMinutes('18:00'),
    })
    expect(status.open).toBe(false)
  })

  it('is closed before the first range, opening later today', () => {
    expect(openStatus(STANDARD, { weekday: 'mon', minutes: 420 })).toEqual({
      open: false,
      nextOpen: { weekday: 'mon', opens: '08:00', isToday: true },
    })
  })

  it('reports the second range as next during a lunch gap', () => {
    const split = hoursWith({
      mon: [
        { opens: '08:00', closes: '13:00' },
        { opens: '14:00', closes: '18:00' },
      ],
    })
    expect(
      openStatus(split, { weekday: 'mon', minutes: toMinutes('13:30') }),
    ).toEqual({
      open: false,
      nextOpen: { weekday: 'mon', opens: '14:00', isToday: true },
    })
  })

  it('treats a 00:00–24:00 range as open all day', () => {
    const allDay = hoursWith({ mon: [{ opens: '00:00', closes: '24:00' }] })
    expect(openStatus(allDay, { weekday: 'mon', minutes: 0 }).open).toBe(true)
    expect(openStatus(allDay, { weekday: 'mon', minutes: 1439 }).open).toBe(
      true,
    )
  })

  it('finds tomorrow when closed for the rest of today', () => {
    const twoDays = hoursWith({
      mon: [{ opens: '08:00', closes: '18:00' }],
      tue: [{ opens: '09:00', closes: '17:00' }],
    })
    expect(
      openStatus(twoDays, { weekday: 'mon', minutes: toMinutes('19:00') }),
    ).toEqual({
      open: false,
      nextOpen: { weekday: 'tue', opens: '09:00', isToday: false },
    })
  })

  it('skips a closed Sunday from Saturday evening to Monday', () => {
    const weekdaysOnly = hoursWith({
      mon: [{ opens: '08:00', closes: '18:00' }],
      sat: [{ opens: '08:00', closes: '13:00' }],
    })
    expect(
      openStatus(weekdaysOnly, { weekday: 'sat', minutes: toMinutes('15:00') }),
    ).toEqual({
      open: false,
      nextOpen: { weekday: 'mon', opens: '08:00', isToday: false },
    })
  })

  it('wraps the week from Sunday night to Monday morning', () => {
    const mondayOnly = hoursWith({ mon: [{ opens: '08:00', closes: '18:00' }] })
    expect(
      openStatus(mondayOnly, { weekday: 'sun', minutes: toMinutes('22:00') }),
    ).toEqual({
      open: false,
      nextOpen: { weekday: 'mon', opens: '08:00', isToday: false },
    })
  })

  it('returns no nextOpen when there are no hours all week', () => {
    expect(
      openStatus(CLOSED_ALL_WEEK, { weekday: 'wed', minutes: 600 }),
    ).toEqual({ open: false })
  })

  it('finds the same weekday next week when only earlier hours remain', () => {
    const mondayOnly = hoursWith({ mon: [{ opens: '08:00', closes: '18:00' }] })
    expect(
      openStatus(mondayOnly, { weekday: 'mon', minutes: toMinutes('19:00') }),
    ).toEqual({
      open: false,
      nextOpen: { weekday: 'mon', opens: '08:00', isToday: false },
    })
  })
})

describe('soonestOpening', () => {
  const pharmacyWith = (name: string, hours: WeeklyHours): Pharmacy => ({
    name,
    type: 'government',
    parish: 'St. Michael',
    address: 'Bridgetown',
    phone: '(246) 536-0000',
    hours,
  })

  // 2026-08-19T18:30:00Z = Wednesday 14:30 in Barbados.
  const NOW = new Date('2026-08-19T18:30:00Z')

  it('prefers an opening later today over an earlier clock time tomorrow', () => {
    const laterToday = pharmacyWith(
      'Later Today',
      hoursWith({ wed: [{ opens: '16:00', closes: '20:00' }] }),
    )
    const tomorrowMorning = pharmacyWith(
      'Tomorrow Morning',
      hoursWith({ thu: [{ opens: '08:00', closes: '18:00' }] }),
    )
    const result = soonestOpening([tomorrowMorning, laterToday], NOW)
    expect(result?.pharmacy.name).toBe('Later Today')
    expect(result?.isToday).toBe(true)
    expect(result?.opens).toBe('16:00')
  })

  it('skips pharmacies that are open right now', () => {
    const openNow = pharmacyWith(
      'Open Now',
      hoursWith({ wed: [{ opens: '08:00', closes: '18:00' }] }),
    )
    const closed = pharmacyWith(
      'Closed',
      hoursWith({ sat: [{ opens: '09:00', closes: '13:00' }] }),
    )
    const result = soonestOpening([openNow, closed], NOW)
    expect(result?.pharmacy.name).toBe('Closed')
    expect(result?.weekday).toBe('sat')
  })

  it('returns null when nothing has upcoming hours', () => {
    expect(
      soonestOpening([pharmacyWith('Never', CLOSED_ALL_WEEK)], NOW),
    ).toBeNull()
  })
})

describe('pharmacyStatus', () => {
  const pharmacy: Pharmacy = {
    name: 'Test Pharmacy',
    type: 'government',
    parish: 'St. Michael',
    address: 'Bridgetown',
    phone: '(246) 536-0000',
    hours: hoursWith({ wed: [{ opens: '08:00', closes: '18:00' }] }),
  }

  it('is open at 14:30 Barbados time on a Wednesday', () => {
    expect(pharmacyStatus(pharmacy, new Date('2026-08-19T18:30:00Z'))).toEqual({
      open: true,
      closes: '18:00',
    })
  })

  it('is closed at 23:00 Barbados time the same Wednesday', () => {
    const status = pharmacyStatus(pharmacy, new Date('2026-08-20T03:00:00Z'))
    expect(status?.open).toBe(false)
  })

  it('is null (unknown) when hours are not confirmed', () => {
    const unconfirmed: Pharmacy = { ...pharmacy, hours: undefined }
    expect(
      pharmacyStatus(unconfirmed, new Date('2026-08-19T18:30:00Z')),
    ).toBeNull()
  })
})

describe('formatTime', () => {
  it('formats morning, afternoon, midday and midnight', () => {
    expect(formatTime('08:00')).toBe('8:00 am')
    expect(formatTime('13:30')).toBe('1:30 pm')
    expect(formatTime('12:00')).toBe('midday')
    expect(formatTime('00:00')).toBe('midnight')
    expect(formatTime('24:00')).toBe('midnight')
  })
})

describe('formatTimeShort', () => {
  it('compresses times for the one-line summary', () => {
    expect(formatTimeShort('08:00')).toBe('8am')
    expect(formatTimeShort('08:15')).toBe('8:15am')
    expect(formatTimeShort('22:00')).toBe('10pm')
    expect(formatTimeShort('12:00')).toBe('midday')
    expect(formatTimeShort('00:00')).toBe('midnight')
  })
})

describe('weeklyHoursSummary', () => {
  it('groups consecutive days with identical hours', () => {
    const hours = hoursWith({
      mon: [{ opens: '08:15', closes: '22:00' }],
      tue: [{ opens: '08:15', closes: '22:00' }],
      wed: [{ opens: '08:15', closes: '22:00' }],
      thu: [{ opens: '08:15', closes: '22:00' }],
      fri: [{ opens: '08:15', closes: '22:00' }],
      sat: [{ opens: '08:15', closes: '16:30' }],
    })
    expect(weeklyHoursSummary(hours)).toBe(
      'Mon–Fri 8:15am–10pm · Sat 8:15am–4:30pm',
    )
  })

  it('shows split shifts with an ampersand', () => {
    const hours = hoursWith({
      mon: [
        { opens: '08:00', closes: '15:00' },
        { opens: '18:45', closes: '21:00' },
      ],
      sun: [{ opens: '08:00', closes: '12:30' }],
    })
    expect(weeklyHoursSummary(hours)).toBe(
      'Mon 8am–3pm & 6:45pm–9pm · Sun 8am–12:30pm',
    )
  })

  it('labels 24-hour days and weekend runs', () => {
    const hours = hoursWith({
      sat: [{ opens: '00:00', closes: '24:00' }],
      sun: [{ opens: '00:00', closes: '24:00' }],
    })
    expect(weeklyHoursSummary(hours)).toBe('Sat–Sun 24 hours')
  })

  it('handles a fully closed week', () => {
    expect(weeklyHoursSummary(CLOSED_ALL_WEEK)).toBe('Closed all week')
  })
})

describe('dayHoursLabel', () => {
  it('labels a single range', () => {
    expect(dayHoursLabel([{ opens: '08:00', closes: '18:00' }])).toBe(
      '8:00 am to 6:00 pm',
    )
  })

  it('joins split shifts with "and"', () => {
    expect(
      dayHoursLabel([
        { opens: '08:00', closes: '13:00' },
        { opens: '14:00', closes: '18:00' },
      ]),
    ).toBe('8:00 am to 1:00 pm and 2:00 pm to 6:00 pm')
  })

  it('labels a closed day and a 24-hour day', () => {
    expect(dayHoursLabel([])).toBe('Closed')
    expect(dayHoursLabel([{ opens: '00:00', closes: '24:00' }])).toBe(
      'Open 24 hours',
    )
  })
})
