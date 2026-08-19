import type { Pharmacy } from '../-data/pharmacies'
import { pharmacySlug } from './pharmacy-slug'

const PHARMACY_LANDING_HREF =
  '/health-and-emergency-services/find-an-open-pharmacy'

export const PHARMACY_FIND_HREF = `${PHARMACY_LANDING_HREF}/find`

// Markdown guidance pages live at category level (the module's $slug route
// owns every child URL of the service, so content pages cannot nest there).
export const SLIP_COLOURS_HREF =
  '/health-and-emergency-services/prescription-slip-colours'

/** Canonical page for one pharmacy — the URL people share. */
export function pharmacyDetailHref(name: string): string {
  return `${PHARMACY_LANDING_HREF}/${pharmacySlug(name)}`
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
 * The pharmacy advertises WhatsApp ordering — with or without a confirmed
 * number. Drives the card tag; the deep link needs the confirmed number.
 */
export function offersWhatsApp(pharmacy: Pharmacy): boolean {
  return Boolean(pharmacy.whatsapp) || /whatsapp/i.test(pharmacy.notes ?? '')
}

/**
 * WhatsApp ordering deep link — opens WhatsApp in a new tab with the
 * message prefilled. Uses the confirmed WhatsApp number when the record
 * has one, else the listed phone. The prefilled message reflects how the
 * service actually
 * works: the citizen sends their existing prescription for filling — they
 * are not asking the pharmacy to prescribe.
 */
export function whatsappHref(pharmacy: Pharmacy): string | null {
  if (!offersWhatsApp(pharmacy)) return null
  const source = pharmacy.whatsapp || pharmacy.phone
  if (!source) return null
  const number = phoneE164(source).slice(1)
  const text = encodeURIComponent(
    `Hello, I would like to fill a prescription at ${pharmacy.name}. I will send a photo of my prescription.`,
  )
  return `https://wa.me/${number}?text=${text}`
}
