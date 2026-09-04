import { describe, expect, it } from 'vitest'
import type { Pharmacy } from '../-data/pharmacies'
import { acceptsSlip, nearestAccepting } from './slips'

const pharmacy = (overrides: Partial<Pharmacy>): Pharmacy => ({
  name: 'Test',
  type: 'government',
  parish: 'St. Michael',
  address: 'Bridgetown',
  phone: '',
  ...overrides,
})

describe('acceptsSlip', () => {
  it('government pharmacies accept yellow and green prescriptions only', () => {
    const gov = pharmacy({ type: 'government' })
    expect(acceptsSlip(gov, 'white')).toBe(false)
    expect(acceptsSlip(gov, 'yellow')).toBe(true)
    expect(acceptsSlip(gov, 'green')).toBe(true)
  })

  it('subsidised private pharmacies accept white only', () => {
    const priv = pharmacy({ type: 'private-sbs' })
    expect(acceptsSlip(priv, 'white')).toBe(true)
    expect(acceptsSlip(priv, 'yellow')).toBe(false)
    expect(acceptsSlip(priv, 'green')).toBe(false)
  })

  it('private pharmacies outside the subsidy accept none of them', () => {
    const priv = pharmacy({ type: 'private' })
    expect(acceptsSlip(priv, 'white')).toBe(false)
    expect(acceptsSlip(priv, 'yellow')).toBe(false)
    expect(acceptsSlip(priv, 'green')).toBe(false)
  })
})

describe('nearestAccepting', () => {
  const here = pharmacy({
    name: 'Here',
    type: 'private-sbs',
    coords: { lat: 13.1, lon: -59.6 },
  })
  const nearGov = pharmacy({
    name: 'Near Gov',
    coords: { lat: 13.11, lon: -59.6 },
  })
  const farGov = pharmacy({
    name: 'Far Gov',
    coords: { lat: 13.25, lon: -59.64 },
  })
  const nearPrivate = pharmacy({
    name: 'Near Private',
    type: 'private-sbs',
    coords: { lat: 13.101, lon: -59.6 },
  })

  it('finds the closest pharmacy that definitely accepts the slip', () => {
    const result = nearestAccepting(here, 'yellow', [
      farGov,
      nearPrivate,
      nearGov,
      here,
    ])
    expect(result?.pharmacy.name).toBe('Near Gov')
    expect(result?.km).toBeGreaterThan(0)
    expect(result?.km).toBeLessThan(2)
  })

  it('finds a private pharmacy for a white prescription', () => {
    const result = nearestAccepting(nearGov, 'white', [
      farGov,
      here,
      nearPrivate,
      nearGov,
    ])
    expect(result?.pharmacy.name).toBe('Near Private')
  })

  it('returns null when the pharmacy itself has no coordinates', () => {
    const noCoords = pharmacy({ name: 'NoCoords', type: 'private-sbs' })
    expect(nearestAccepting(noCoords, 'yellow', [nearGov])).toBeNull()
  })
})
