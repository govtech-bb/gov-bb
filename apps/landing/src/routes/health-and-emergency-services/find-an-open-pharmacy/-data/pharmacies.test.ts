import { describe, expect, it } from 'vitest'
import { toMinutes } from '../-lib/opening-hours'
import { pharmacySlug } from '../-lib/pharmacy-slug'
import { PHARMACIES, WEEKDAYS } from './pharmacies'

// Integrity checks the type system can't express — these keep holding when
// the dataset is regenerated from a newer Drug Service register.
describe('pharmacy dataset', () => {
  it('has records', () => {
    expect(PHARMACIES.length).toBeGreaterThan(0)
  })

  it('has a unique, non-empty share slug per pharmacy', () => {
    const slugs = PHARMACIES.map((p) => pharmacySlug(p.name))
    expect(new Set(slugs).size).toBe(PHARMACIES.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('converted the prototype minute slots faithfully (spot check)', () => {
    const winstonScott = PHARMACIES.find(
      (p) => p.name === 'Winston Scott Polyclinic',
    )
    // Prototype: Mon–Fri 495–1320 (8:15am–10pm), Sat 495–990 (8:15am–4:30pm).
    expect(winstonScott?.hours?.mon).toEqual([
      { opens: '08:15', closes: '22:00' },
    ])
    expect(winstonScott?.hours?.sat).toEqual([
      { opens: '08:15', closes: '16:30' },
    ])
    expect(winstonScott?.hours?.sun).toEqual([])
  })

  it('includes the reviewed government-clinic operating hours', () => {
    const stAndrew = PHARMACIES.find(
      (p) => p.name === 'St. Andrew Outpatient Clinic',
    )
    expect(stAndrew?.hours?.mon).toEqual([{ opens: '08:15', closes: '12:00' }])
    expect(stAndrew?.hours?.wed).toEqual([{ opens: '08:15', closes: '12:00' }])

    const randalPhillips = PHARMACIES.find(
      (p) => p.name === 'Randal Phillips Polyclinic',
    )
    expect(randalPhillips?.hours?.mon).toEqual([
      { opens: '07:30', closes: '16:30' },
    ])
  })

  it.each(PHARMACIES.map((p) => [p.name, p] as const))(
    '%s has well-formed fields and hours',
    (_name, pharmacy) => {
      expect(pharmacy.name.trim()).not.toBe('')
      expect(pharmacy.address.trim()).not.toBe('')
      if (pharmacy.phone !== '') {
        expect(pharmacy.phone).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/)
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
      for (const weekday of WEEKDAYS) {
        const ranges = pharmacy.hours[weekday]
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
