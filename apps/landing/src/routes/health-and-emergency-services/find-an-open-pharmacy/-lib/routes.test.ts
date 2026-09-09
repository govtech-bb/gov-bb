import { describe, expect, it } from 'vitest'
import type { Pharmacy } from '../-data/pharmacies'
import { pharmacyDetailHref, phoneE164, whatsappHref } from './routes'

const pharmacy = (overrides: Partial<Pharmacy>): Pharmacy => ({
  name: 'Test',
  slug: 'original-name',
  type: 'private',
  pppStatus: 'participating',
  parish: 'St. Michael',
  address: 'Bridgetown',
  phone: '(246) 271-3784',
  ...overrides,
})

describe('phoneE164', () => {
  it('normalizes display and bare local forms', () => {
    expect(phoneE164('(246) 536-3419')).toBe('+12465363419')
    expect(phoneE164('536-3419')).toBe('+12465363419')
  })
})

describe('pharmacyDetailHref', () => {
  it('preserves the stored URL when the display name changes', () => {
    expect(pharmacyDetailHref(pharmacy({ name: 'Renamed pharmacy' }))).toBe(
      '/health-and-emergency-services/find-an-open-pharmacy/original-name',
    )
  })
})

describe('whatsappHref', () => {
  it('uses the confirmed number when present', () => {
    expect(whatsappHref(pharmacy({ whatsapp: '(246) 426-6387' }))).toContain(
      'wa.me/12464266387',
    )
  })

  it('never guesses a WhatsApp number from the phone or notes', () => {
    expect(
      whatsappHref(
        pharmacy({ notes: 'WhatsApp prescription service available.' }),
      ),
    ).toBeNull()
  })

  it('is null for pharmacies that do not offer WhatsApp', () => {
    expect(whatsappHref(pharmacy({ notes: 'Drive-through.' }))).toBeNull()
  })
})
