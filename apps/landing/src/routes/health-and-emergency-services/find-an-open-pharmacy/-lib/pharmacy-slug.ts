import type { Pharmacy } from '../-data/pharmacies'
import { PHARMACIES } from '../-data/pharmacies'

export function findPharmacyBySlug(
  slug: string,
  pharmacies: ReadonlyArray<Pharmacy> = PHARMACIES,
): Pharmacy | undefined {
  return pharmacies.find((pharmacy) => pharmacy.slug === slug)
}
