import type { Pharmacy } from '../-data/pharmacies'
import { PHARMACIES } from '../-data/pharmacies'

/**
 * URL slug for a pharmacy, derived from its (unique) name — the $slug
 * segment of its canonical detail page.
 */
export function pharmacySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function findPharmacyBySlug(slug: string): Pharmacy | undefined {
  return PHARMACIES.find((pharmacy) => pharmacySlug(pharmacy.name) === slug)
}
