import { describe, expect, it } from 'vitest'
import type { Pharmacy } from '../-data/pharmacies'
import { pharmacyJsonLd } from './json-ld'

const CLOSED = [] as const

describe('pharmacyJsonLd', () => {
  const pharmacy: Pharmacy = {
    name: 'Winston Scott Polyclinic',
    type: 'government',
    parish: 'St. Michael',
    address: 'Jemmotts Lane, St. Michael',
    phone: '(246) 536-3419',
    coords: { lat: 13.091964, lon: -59.607581 },
    hours: {
      mon: [{ opens: '08:15', closes: '22:00' }],
      tue: CLOSED,
      wed: CLOSED,
      thu: CLOSED,
      fri: CLOSED,
      sat: [{ opens: '00:00', closes: '24:00' }],
      sun: CLOSED,
    },
  }

  it('builds a Pharmacy entity from the record', () => {
    const ld = pharmacyJsonLd(pharmacy, 'https://example.test/p')
    expect(ld['@type']).toBe('Pharmacy')
    expect(ld.telephone).toBe('+12465363419')
    expect(ld.address.addressRegion).toBe('St. Michael')
    expect(ld.geo?.latitude).toBeCloseTo(13.091964)
    expect(ld.openingHoursSpecification).toContainEqual({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Monday',
      opens: '08:15',
      closes: '22:00',
    })
  })

  it("maps '24:00' to the last indexable minute", () => {
    const ld = pharmacyJsonLd(pharmacy, 'https://example.test/p')
    expect(ld.openingHoursSpecification).toContainEqual({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Saturday',
      opens: '00:00',
      closes: '23:59',
    })
  })

  it('omits phone, geo and hours when the record lacks them', () => {
    const sparse = pharmacyJsonLd(
      { ...pharmacy, phone: '', coords: undefined, hours: undefined },
      'https://example.test/p',
    )
    expect(sparse).not.toHaveProperty('telephone')
    expect(sparse).not.toHaveProperty('geo')
    expect(sparse).not.toHaveProperty('openingHoursSpecification')
  })
})
