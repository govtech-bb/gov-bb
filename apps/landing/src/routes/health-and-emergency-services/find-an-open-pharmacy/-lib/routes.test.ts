import { describe, expect, it } from 'vitest'
import type { Pharmacy } from '../-data/pharmacies'
import { offersWhatsApp, phoneE164, whatsappHref } from './routes'

const pharmacy = (overrides: Partial<Pharmacy>): Pharmacy => ({
  name: 'Test',
  type: 'private-sbs',
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

describe('offersWhatsApp', () => {
  it('is true for a confirmed number', () => {
    expect(offersWhatsApp(pharmacy({ whatsapp: '(246) 426-6387' }))).toBe(true)
  })

  it('is true when only the notes advertise the service (iMart case)', () => {
    expect(
      offersWhatsApp(
        pharmacy({ notes: 'WhatsApp prescription service available.' }),
      ),
    ).toBe(true)
  })

  it('is false otherwise', () => {
    expect(
      offersWhatsApp(pharmacy({ notes: 'Drive-through available.' })),
    ).toBe(false)
  })
})

describe('whatsappHref', () => {
  it('uses the confirmed number when present', () => {
    expect(whatsappHref(pharmacy({ whatsapp: '(246) 426-6387' }))).toContain(
      'wa.me/12464266387',
    )
  })

  it('falls back to the listed phone when only the notes advertise it', () => {
    expect(
      whatsappHref(
        pharmacy({ notes: 'WhatsApp prescription service available.' }),
      ),
    ).toContain('wa.me/12462713784')
  })

  it('is null for pharmacies that do not offer WhatsApp', () => {
    expect(whatsappHref(pharmacy({ notes: 'Drive-through.' }))).toBeNull()
  })
})
