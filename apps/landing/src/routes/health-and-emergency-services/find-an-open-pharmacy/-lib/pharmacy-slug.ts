import type { Pharmacy } from '../-data/pharmacies'
import { PHARMACIES } from '../-data/pharmacies'

export function findPharmacyBySlug(slug: string): Pharmacy | undefined {
  return PHARMACIES.find((pharmacy) => pharmacy.slug === slug)
}
