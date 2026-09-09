/**
 * Pharmacies - Barbados
 * --------------------------------------------------------------
 * Single source of truth for the pharmacy finder at
 * /health-and-emergency-services/find-an-open-pharmacy.
 *
 * Edit pharmacy facts and their verification references in pharmacies.json.
 * Keep the service in preview until its data and release checks are complete.
 */

import pharmacyData from './pharmacies.json'

export const PARISHES = [
  'Christ Church',
  'St. Andrew',
  'St. George',
  'St. James',
  'St. John',
  'St. Joseph',
  'St. Lucy',
  'St. Michael',
  'St. Peter',
  'St. Philip',
  'St. Thomas',
] as const

export type Parish = (typeof PARISHES)[number]

/** Weekday keys, Monday first (display order). */
export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

/**
 * One continuous opening period within a single day, 24-hour 'HH:MM'
 * wall-clock. Semantics are [opens, closes): open at 'opens' exactly,
 * closed at 'closes' exactly.
 */
export interface TimeRange {
  /** '00:00'–'23:59'. */
  opens: string
  /** Must be later than opens; '24:00' means end of day. */
  closes: string
}

/**
 * Opening ranges per day, earliest first. [] = closed that day; two ranges =
 * a split shift; a single 00:00–24:00 range = open 24 hours.
 */
export type WeeklyHours = Readonly<Record<Weekday, ReadonlyArray<TimeRange>>>

export interface LatLon {
  lat: number
  lon: number
}

export type PharmacyType = 'government' | 'private'

export type PppStatus =
  | 'participating'
  | 'not-participating'
  | 'unconfirmed'
  | 'not-applicable'

export interface Verification {
  fields: ReadonlyArray<'ppp' | 'hours' | 'contacts'>
  source: string
  /** Date this source was checked, not a guarantee that the facts cannot change. */
  checkedOn: string
  note?: string
}

export interface Pharmacy {
  /** Stable across name changes; used by details, links and the sitemap. */
  slug: string
  name: string
  type: PharmacyType
  pppStatus: PppStatus
  /** 'All parishes' is the island-wide delivery service. */
  parish: Parish | 'All parishes'
  address: string
  /** Display form '(246) NNN-NNNN'; '' when no number is listed. */
  phone: string
  phoneExtension?: string
  additionalPhones?: ReadonlyArray<string>
  /** Absent = opening hours not confirmed - open/closed state is unknown. */
  hours?: WeeklyHours
  /** Absent = unknown; [] = closed; ranges = confirmed holiday hours. */
  bankHolidayHours?: ReadonlyArray<TimeRange>
  /** Geocoded point, used for the "Use my location" distance sort. */
  coords?: LatLon
  notes?: string
  /** Bus routes from Bridgetown, when known. */
  routes?: string
  /**
   * Confirmed WhatsApp ordering number, display form '(246) NNN-NNNN'.
   * Only set where the pharmacy explicitly published one - a dead wa.me
   * link is worse than no button.
   */
  whatsapp?: string
  verification?: ReadonlyArray<Verification>
}

export const PHARMACIES_LAST_UPDATED = pharmacyData.lastUpdated

export const PHARMACIES = pharmacyData.pharmacies as ReadonlyArray<Pharmacy>
export const PHARMACY_COUNT = PHARMACIES.length
