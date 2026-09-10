import { describe, expect, it } from 'vitest'
import { pharmacyStatus, toMinutes } from '../-lib/opening-hours'
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
    expect(PHARMACIES).toHaveLength(163)
    expect(PHARMACIES).toEqual(ALL_PHARMACIES)
    for (const slug of [
      'market-hill-dispensary',
      'dasae-pharmacy-sparman-clinic',
    ]) {
      expect(findPharmacyBySlug(slug)).toBeDefined()
      expect(findPharmacyBySlug(slug)?.hours).toBeUndefined()
    }
    expect(findPharmacyBySlug('winston-scott-polyclinic')).toBeDefined()
  })

  it('includes opening hours for all 109 pharmacies in the supplied participating list', () => {
    const participating = ALL_PHARMACIES.filter(
      (pharmacy) => pharmacy.pppStatus === 'participating',
    )
    expect(participating).toHaveLength(109)
    for (const pharmacy of participating) {
      expect(pharmacy.hours, pharmacy.name).toBeDefined()
    }
  })

  it('keeps the previously reviewed schedules when filling missing hours', () => {
    expect(findPharmacyBySlug('avis-pharmacy')?.hours).toMatchObject({
      mon: [{ opens: '08:00', closes: '18:00' }],
      sat: [{ opens: '08:00', closes: '16:00' }],
      sun: [],
    })
    expect(findPharmacyBySlug('allington-pharmacy')?.hours).toMatchObject({
      thu: [{ opens: '09:00', closes: '17:00' }],
      sat: [{ opens: '09:00', closes: '13:30' }],
    })
    expect(findPharmacyBySlug('whole-health-pharmacy')).toMatchObject({
      hours: { sat: [{ opens: '08:00', closes: '15:00' }] },
      whatsapp: '(246) 422-5207',
    })

    const sunday = new Date('2026-09-13T16:00:00Z')
    expect(
      pharmacyStatus(findPharmacyBySlug('avis-pharmacy')!, sunday)?.open,
    ).toBe(false)
  })

  it('uses the complete C S Pharmacy schedule from its named document row', () => {
    const pharmacy = findPharmacyBySlug('c-s-pharmacy')!
    expect(pharmacy.hours).toEqual({
      mon: [{ opens: '08:00', closes: '17:00' }],
      tue: [{ opens: '08:00', closes: '17:00' }],
      wed: [{ opens: '08:00', closes: '17:00' }],
      thu: [{ opens: '08:00', closes: '17:00' }],
      fri: [{ opens: '08:00', closes: '18:00' }],
      sat: [{ opens: '08:00', closes: '16:30' }],
      sun: [],
    })
    expect(pharmacyStatus(pharmacy, new Date('2026-09-11T21:30:00Z'))).toEqual({
      open: true,
      closes: '18:00',
    })
    expect(
      pharmacyStatus(pharmacy, new Date('2026-09-12T20:30:00Z'))?.open,
    ).toBe(false)
  })

  it('retains supplied split shifts and distinguishes fixed and varying holiday hours', () => {
    expect(findPharmacyBySlug('heritage-pharmacy')?.hours?.mon).toEqual([
      { opens: '08:00', closes: '15:00' },
      { opens: '18:45', closes: '21:00' },
    ])
    expect(findPharmacyBySlug('belmont-pharmacy')?.bankHolidayHours).toEqual([
      { opens: '09:00', closes: '12:00' },
    ])
    expect(
      findPharmacyBySlug('massy-pharmacy-sargeants-village')?.bankHolidayHours,
    ).toEqual([{ opens: '08:00', closes: '14:00' }])
    expect(findPharmacyBySlug('drugmart')?.bankHolidayHours).toEqual([])
    expect(
      findPharmacyBySlug('whole-health-pharmacy')?.bankHolidayHours,
    ).toEqual([])
    for (const slug of ['delaware-dispensary', 'nutripharm-services-inc']) {
      expect(findPharmacyBySlug(slug)?.bankHolidayHours).toBeUndefined()
    }
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

  it('stores the corrected branch participation explicitly', () => {
    for (const slug of [
      'premier-pharmacy',
      'pharm-n-care-warrens',
      'total-care-pharmacy-emerald-city',
    ]) {
      expect(findPharmacyBySlug(slug)).toMatchObject({
        type: 'private',
        pppStatus: 'participating',
      })
    }
    for (const slug of ['pharm-n-care-worthing', 'total-care-pharmacy']) {
      expect(findPharmacyBySlug(slug)).toMatchObject({
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
    ).toHaveLength(109)
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
    expect(welches?.hours?.sun).toEqual([{ opens: '09:00', closes: '14:00' }])
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

  // notes is rendered to citizens as a grey caveat on the card and the detail
  // page, so it must carry only facts a person can act on - never internal
  // review language. See govtech-bb/projects#914.
  it('keeps internal review language out of user-facing notes', () => {
    const INTERNAL = [
      /DATA CONFLICT/i,
      /verify with/i,
      /confirm (with|by)/i,
      /business directory/i,
      /location approximate/i,
      /not confirmed/i,
    ]
    const noted = ALL_PHARMACIES.filter((pharmacy) => pharmacy.notes)
    expect(noted.map((pharmacy) => pharmacy.slug)).toEqual([
      'st-andrew-outpatient-clinic',
      'st-joseph-outpatient-clinic',
      'st-thomas-outpatient-clinic',
      'imart-pharmacy-w-plaza',
      'jillandeehlp-island-wide-delivery',
    ])
    for (const pharmacy of noted) {
      for (const marker of INTERNAL) {
        expect(pharmacy.notes).not.toMatch(marker)
      }
    }
  })
})
