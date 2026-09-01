/**
 * Pharmacies — Barbados
 * --------------------------------------------------------------
 * Single source of truth for the pharmacy finder at
 * /health-and-emergency-services/find-an-open-pharmacy.
 *
 * Records live in pharmacies.json — edit that file directly, one object per
 * pharmacy. Sources: the GovTech pharmacy prototype dataset (23 July 2026),
 * the Drug Service register of government dispensaries (verified May 2026)
 * and the Drug Service Active PPP list (supplied 31 August 2026). Known
 * conflicts are flagged in each record's notes. Keep META.visibility
 * 'preview' until the Drug Service signs the data off.
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

/**
 * What the visit costs — the reader's decision variable.
 * government = free polyclinic dispensary; private-sbs = participating
 * private pharmacy on the Drug Service Active PPP list (small dispensing
 * fee); private = a private pharmacy that is not on that list, so the patient
 * pays the full price.
 */
export type PharmacyType = 'government' | 'private-sbs' | 'private'

export interface Pharmacy {
  name: string
  type: PharmacyType
  /** 'All parishes' is the island-wide delivery service. */
  parish: Parish | 'All parishes'
  address: string
  /** Display form '(246) NNN-NNNN'; '' when no number is listed. */
  phone: string
  /** Absent = opening hours not confirmed — open/closed state is unknown. */
  hours?: WeeklyHours
  /** Geocoded point, used for the "Use my location" distance sort. */
  coords?: LatLon
  notes?: string
  /** Bus routes from Bridgetown, when known. */
  routes?: string
  /**
   * Confirmed WhatsApp ordering number, display form '(246) NNN-NNNN'.
   * Only set where the pharmacy explicitly published one — a dead wa.me
   * link is worse than no button.
   */
  whatsapp?: string
}

export const PHARMACIES_LAST_UPDATED = '2026-08-31'
export const PHARMACIES_NEXT_REVIEW = '2027-01-01'
/** When the Drug Service register of government dispensaries was verified. */
export const REGISTER_VERIFIED = 'May 2026'
/** When the Drug Service supplied the Active PPP list. */
export const PPP_LIST_UPDATED = 'August 2026'

export const PHARMACIES = pharmacyData as ReadonlyArray<Pharmacy>
export const PHARMACY_COUNT = PHARMACIES.length
