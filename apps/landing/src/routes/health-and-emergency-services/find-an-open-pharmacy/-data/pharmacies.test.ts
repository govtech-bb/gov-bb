import { describe, expect, it } from 'vitest'
import { toMinutes } from '../-lib/opening-hours'
import { findPharmacyBySlug } from '../-lib/pharmacy-slug'
import {
  PARISHES,
  PHARMACIES,
  PHARMACY_CONTENT,
  PHARMACY_COUNT,
  PHARMACIES_LAST_UPDATED,
  WEEKDAYS,
} from './pharmacies.ts'
import { UNKNOWN_FIXTURE } from './pharmacy-fixtures'
import type { Pharmacy } from './pharmacies.ts'
import pharmacyData from './pharmacies.json'

const ALL_PHARMACIES = pharmacyData.pharmacies as ReadonlyArray<Pharmacy>

// Integrity checks the type system can't express - these keep holding when
// pharmacies.json is edited.
describe('pharmacy dataset', () => {
  it('has records', () => {
    expect(ALL_PHARMACIES.length).toBeGreaterThan(0)
    expect(pharmacyData.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('exposes the complete authored content without dropping or rewriting fields', () => {
    expect(pharmacyData.schemaVersion).toBe(1)
    expect(PHARMACY_CONTENT).toEqual(pharmacyData)
    expect(PHARMACIES).toBe(PHARMACY_CONTENT.pharmacies)
    expect(PHARMACY_COUNT).toBe(ALL_PHARMACIES.length)
    expect(PHARMACIES_LAST_UPDATED).toBe(pharmacyData.lastUpdated)
    for (const pharmacy of ALL_PHARMACIES) {
      expect(findPharmacyBySlug(pharmacy.slug)).toEqual(pharmacy)
    }
  })

  it('resolves records without hours from an explicit draft directory', () => {
    expect(findPharmacyBySlug(UNKNOWN_FIXTURE.slug, [UNKNOWN_FIXTURE])).toBe(
      UNKNOWN_FIXTURE,
    )
    expect(
      findPharmacyBySlug('absent-branch', [UNKNOWN_FIXTURE]),
    ).toBeUndefined()
  })

  it('has a unique, non-empty share slug per pharmacy', () => {
    const slugs = ALL_PHARMACIES.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(ALL_PHARMACIES.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it.each(ALL_PHARMACIES.map((p) => [p.name, p] as const))(
    '%s has well-formed fields and hours',
    (_name, pharmacy) => {
      expect(['government', 'private']).toContain(pharmacy.type)
      expect(
        pharmacy.type === 'government'
          ? ['not-applicable']
          : ['participating', 'not-participating', 'unconfirmed'],
      ).toContain(pharmacy.pppStatus)
      expect([...PARISHES, 'All parishes']).toContain(pharmacy.parish)
      expect(pharmacy.name.trim()).not.toBe('')
      expect(pharmacy.address.trim()).not.toBe('')
      if (pharmacy.phone !== '') {
        expect(pharmacy.phone).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/)
      }
      for (const phone of pharmacy.additionalPhones ?? []) {
        expect(phone).toMatch(/^\(246\) \d{3}-\d{4}$/)
        expect(phone).not.toBe(pharmacy.phone)
      }
      if (pharmacy.phoneExtension)
        expect(pharmacy.phoneExtension).toMatch(/^\d+$/)
      const verifiedFields =
        pharmacy.verification?.flatMap((review) => review.fields) ?? []
      expect(new Set(verifiedFields).size).toBe(verifiedFields.length)
      for (const review of pharmacy.verification ?? []) {
        expect(review.fields.length).toBeGreaterThan(0)
        for (const field of review.fields) {
          expect(['ppp', 'hours', 'contacts']).toContain(field)
        }
        expect(review.source.trim()).not.toBe('')
        expect(review.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(review.checkedOn <= pharmacyData.lastUpdated).toBe(true)
      }
      if (pharmacy.whatsapp) {
        expect(pharmacy.whatsapp).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/)
      }
      if (pharmacy.coords) {
        // Barbados bounding box.
        expect(pharmacy.coords.lat).toBeGreaterThan(12.9)
        expect(pharmacy.coords.lat).toBeLessThan(13.4)
        expect(pharmacy.coords.lon).toBeGreaterThan(-59.7)
        expect(pharmacy.coords.lon).toBeLessThan(-59.4)
      }
      if (pharmacy.hours) {
        expect(
          pharmacy.verification?.some((review) =>
            review.fields.includes('hours'),
          ),
        ).toBe(true)
        expect(Object.keys(pharmacy.hours).sort()).toEqual([...WEEKDAYS].sort())
      }
      const schedules = Object.values(pharmacy.hours ?? {})
      if (pharmacy.bankHolidayHours) {
        schedules.push(pharmacy.bankHolidayHours)
      }
      for (const ranges of schedules) {
        let previousClose = -1
        for (const range of ranges) {
          expect(range.opens).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
          expect(range.closes).toMatch(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/)
          expect(toMinutes(range.opens)).toBeLessThan(toMinutes(range.closes))
          // Ascending and non-overlapping within the day.
          expect(toMinutes(range.opens)).toBeGreaterThanOrEqual(previousClose)
          previousClose = toMinutes(range.closes)
        }
      }
    },
  )
})
