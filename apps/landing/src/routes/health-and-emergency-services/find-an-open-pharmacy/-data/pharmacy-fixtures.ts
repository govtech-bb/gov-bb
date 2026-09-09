import type { Pharmacy, PharmacyContent, WeeklyHours } from './pharmacies'
import { PHARMACY_CONTENT } from './pharmacies'

// Behaviour fixtures deliberately do not depend on a maintained branch's hours.
export const WEEKLY_HOURS_FIXTURE: WeeklyHours = {
  mon: [{ opens: '08:00', closes: '17:00' }],
  tue: [{ opens: '08:00', closes: '17:00' }],
  wed: [{ opens: '08:00', closes: '17:00' }],
  thu: [{ opens: '08:00', closes: '17:00' }],
  fri: [{ opens: '08:00', closes: '18:00' }],
  sat: [{ opens: '08:00', closes: '16:30' }],
  sun: [],
}

export const PRIVATE_FIXTURE: Pharmacy = {
  slug: 'example-participating-pharmacy',
  name: 'Example Participating Pharmacy',
  type: 'private',
  pppStatus: 'participating',
  parish: 'St. Michael',
  address: 'Example Street, St. Michael',
  phone: '(246) 555-0100',
  additionalPhones: ['(246) 555-0101'],
  phoneExtension: '3',
  hours: WEEKLY_HOURS_FIXTURE,
  bankHolidayHours: [{ opens: '10:00', closes: '14:00' }],
  coords: { lat: 13.11, lon: -59.61 },
  notes: 'Example record note.',
  routes: '1, 2',
  whatsapp: '(246) 555-0102',
  verification: [
    {
      fields: ['ppp', 'hours', 'contacts'],
      source: 'Example pharmacy source',
      checkedOn: '2026-09-07',
      note: 'Example verification note.',
    },
  ],
}

export const GOVERNMENT_FIXTURE: Pharmacy = {
  slug: 'example-polyclinic',
  name: 'Example Polyclinic',
  type: 'government',
  pppStatus: 'not-applicable',
  parish: 'St. Michael',
  address: 'Example Avenue, St. Michael',
  phone: '(246) 555-0103',
  hours: WEEKLY_HOURS_FIXTURE,
  bankHolidayHours: [],
  coords: { lat: 13.1, lon: -59.6 },
}

export const UNKNOWN_FIXTURE: Pharmacy = {
  slug: 'example-unknown-hours',
  name: 'Example Unknown Hours',
  type: 'private',
  pppStatus: 'unconfirmed',
  parish: 'St. Michael',
  address: 'Example Road, St. Michael',
  phone: '',
}

export const CLOSED_FIXTURE: Pharmacy = {
  ...PRIVATE_FIXTURE,
  slug: 'example-closed',
  name: 'Example Closed Pharmacy',
  hours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
}

export const SPLIT_FIXTURE: Pharmacy = {
  ...PRIVATE_FIXTURE,
  slug: 'example-split-shift',
  name: 'Example Split Shift Pharmacy',
  hours: {
    ...WEEKLY_HOURS_FIXTURE,
    mon: [
      { opens: '08:00', closes: '12:00' },
      { opens: '13:00', closes: '17:00' },
    ],
  },
}

export const ALL_DAY_FIXTURE: Pharmacy = {
  ...PRIVATE_FIXTURE,
  slug: 'example-all-day',
  name: 'Example All Day Pharmacy',
  hours: {
    ...WEEKLY_HOURS_FIXTURE,
    mon: [{ opens: '00:00', closes: '24:00' }],
  },
}

export const PHARMACY_CONTENT_FIXTURE: PharmacyContent = {
  ...PHARMACY_CONTENT,
  lastUpdated: '2026-09-07',
  pharmacies: [
    GOVERNMENT_FIXTURE,
    PRIVATE_FIXTURE,
    UNKNOWN_FIXTURE,
    CLOSED_FIXTURE,
    SPLIT_FIXTURE,
    ALL_DAY_FIXTURE,
    ...Array.from(
      { length: 10 },
      (_, index): Pharmacy => ({
        slug: `example-branch-${index + 1}`,
        name: `Example Branch ${index + 1}`,
        type: 'private',
        pppStatus: 'participating',
        parish: 'St. Philip',
        address: 'Example Branch Road, St. Philip',
        phone: '(246) 555-0104',
        hours: WEEKLY_HOURS_FIXTURE,
      }),
    ),
  ],
}
