import { describe, expect, it } from 'vitest'
import { toMinutes } from '../-lib/opening-hours'
import { findPharmacyBySlug } from '../-lib/pharmacy-slug'
import { PARISHES, PHARMACIES, WEEKDAYS } from './pharmacies.ts'
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

  it('includes every pharmacy, even without confirmed opening hours', () => {
    expect(PHARMACIES).toEqual(ALL_PHARMACIES)
    for (const slug of [
      'market-hill-dispensary',
      'holborn-pharmacy',
      'dasae-pharmacy-sparman-clinic',
      'rxpharma-medical-supplies-dispensary',
    ]) {
      expect(findPharmacyBySlug(slug)).toBeDefined()
      expect(findPharmacyBySlug(slug)?.hours).toBeUndefined()
    }
    expect(findPharmacyBySlug('winston-scott-polyclinic')).toBeDefined()
  })

  it('has a unique, non-empty share slug per pharmacy', () => {
    const slugs = ALL_PHARMACIES.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(ALL_PHARMACIES.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('keeps the reviewed opening hours (spot check)', () => {
    const winstonScott = ALL_PHARMACIES.find(
      (p) => p.name === 'Winston Scott Polyclinic',
    )
    expect(winstonScott?.hours?.mon).toEqual([
      { opens: '08:15', closes: '22:00' },
    ])
    expect(winstonScott?.hours?.sat).toEqual([
      { opens: '08:15', closes: '16:30' },
    ])
    expect(winstonScott?.hours?.sun).toEqual([])
  })

  it('includes the reviewed government-clinic operating hours', () => {
    const stAndrew = ALL_PHARMACIES.find(
      (p) => p.name === 'St. Andrew Outpatient Clinic',
    )
    expect(stAndrew?.hours?.mon).toEqual([{ opens: '08:15', closes: '12:00' }])
    expect(stAndrew?.hours?.wed).toEqual([{ opens: '08:15', closes: '12:00' }])

    const randalPhillips = ALL_PHARMACIES.find(
      (p) => p.name === 'Randal Phillips Polyclinic',
    )
    expect(randalPhillips?.hours?.mon).toEqual([
      { opens: '07:30', closes: '16:30' },
    ])
  })

  it('stores participation explicitly, including the two user corrections', () => {
    for (const name of ['Premier Pharmacy', 'Pharm-N-Care — Warrens']) {
      expect(ALL_PHARMACIES.find((p) => p.name === name)).toMatchObject({
        type: 'private',
        pppStatus: 'not-participating',
      })
    }
    for (const name of [
      'SWM Pharmacy',
      'DASAE Pharmacy (Sparman Clinic)',
      'Market Hill Dispensary',
      'iMart Pharmacy, The Walk, Welches',
    ]) {
      expect(ALL_PHARMACIES.find((p) => p.name === name)).toMatchObject({
        type: 'private',
        pppStatus: 'unconfirmed',
      })
    }
    expect(
      ALL_PHARMACIES.filter((p) => p.pppStatus === 'participating'),
    ).toHaveLength(107)
  })

  it('keeps the two source-listed iMart Welches branches separate', () => {
    expect(
      ALL_PHARMACIES.find((p) => p.name === 'iMart Pharmacy, W Plaza'),
    ).toMatchObject({
      type: 'private',
      pppStatus: 'participating',
      parish: 'St. Thomas',
    })
    const welches = ALL_PHARMACIES.find(
      (p) => p.name === 'iMart Pharmacy, Welches Plaza',
    )
    expect(welches).toMatchObject({
      type: 'private',
      pppStatus: 'participating',
      parish: 'St. Michael',
      address: 'Shop 11, Welches Plaza, St. Michael',
      phoneExtension: '3',
    })
    expect(welches?.hours).toBeUndefined()
  })

  it('uses the parishes from the August 2026 PPP list', () => {
    expect(
      ALL_PHARMACIES.find((p) => p.name === 'Apothec Pharmacy')?.parish,
    ).toBe('St. Michael')
    expect(
      ALL_PHARMACIES.find((p) => p.name === 'Callies Pharmacy, Cottage')
        ?.parish,
    ).toBe('St. John')
  })

  it('keeps the Wildey Mall hours published by OneUp Pharmacy', () => {
    const wildey = ALL_PHARMACIES.find(
      (p) => p.name === 'OneUp Pharmacy, Wildey Mall',
    )
    expect(wildey?.hours?.mon).toEqual([{ opens: '08:30', closes: '17:30' }])
    expect(wildey?.hours?.sat).toEqual([{ opens: '08:30', closes: '16:30' }])
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
      if (!pharmacy.hours) return
      expect(
        pharmacy.verification?.some((review) =>
          review.fields.includes('hours'),
        ),
      ).toBe(true)
      expect(Object.keys(pharmacy.hours).sort()).toEqual([...WEEKDAYS].sort())
      const schedules = Object.values(pharmacy.hours)
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
