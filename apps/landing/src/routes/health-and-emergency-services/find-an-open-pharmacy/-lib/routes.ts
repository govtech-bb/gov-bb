import type { Pharmacy } from '../-data/pharmacies'
// import { parsePhoneNumberFromString } from 'libphonenumber-js'

const PHARMACY_LANDING_HREF =
  '/health-and-emergency-services/find-an-open-pharmacy'

export const PHARMACY_FIND_HREF = `${PHARMACY_LANDING_HREF}/find`

// Markdown guidance pages live at category level (the module's $slug route
// owns every child URL of the service, so content pages cannot nest there).
export const SLIP_COLOURS_HREF =
  '/health-and-emergency-services/prescription-colours'

/** Canonical page for one pharmacy - the URL people share. */
export function pharmacyDetailHref(pharmacy: Pick<Pharmacy, 'slug'>): string {
  return `${PHARMACY_LANDING_HREF}/${pharmacy.slug}`
}

export function mapsUrl(pharmacy: Pharmacy): string {
  const query = encodeURIComponent(
    `${pharmacy.name}, ${pharmacy.address}, Barbados`,
  )
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

/** '(246) 536-3419' or '536-3419' → '+12465363419'. */
export function phoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `+1${digits.length === 7 ? `246${digits}` : digits}`
}

export function telHref(phone: string): string {
  return `tel:${phoneE164(phone)}`
}

export const DRUG_SERVICE_PHONE = '(246) 535-4300'

/**
 * Only the explicitly verified prescription channel may receive a prescription.
 */
export function whatsappHref(pharmacy: Pharmacy): string | null {
  if (!pharmacy.whatsapp) return null
  // const number = parsePhoneNumberFromString(pharmacy.whatsapp, 'BB')
  const number = phoneE164(pharmacy.whatsapp).slice(1)
  const text = encodeURIComponent(
    `Hello, I would like to fill a prescription at ${pharmacy.name}. I will send a photo of my prescription.`,
  )
  return `https://wa.me/${number}?text=${text}`
}
