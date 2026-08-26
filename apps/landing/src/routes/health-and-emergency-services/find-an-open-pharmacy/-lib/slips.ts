/**
 * Prescription slip model.
 * --------------------------------------------------------------
 * Barbados prescriptions come on coloured slips, and the colour decides
 * which pharmacies can fill them. Acceptance is derived from the pharmacy's
 * confirmed Drug Service type — the single source of truth — never stored
 * per record:
 *
 *   white  (Drug Service)   → private pharmacies in the subsidy only
 *   yellow (GEHP)           → government pharmacies only
 *   green  (GEHP dependant) → government pharmacies only
 *
 * Blue and pink are not filter options because both confirmed facility types
 * accept them.
 *
 * For an unconfirmed pharmacy the honest answer is unknown (null).
 */

import type { Pharmacy } from '../-data/pharmacies'
import { pharmacyDistanceKm } from './pharmacy-distance'

export const SLIP_COLOURS = ['white', 'yellow', 'green'] as const

export type SlipColour = (typeof SLIP_COLOURS)[number]

export const SLIP_LABELS = {
  white: 'White — Drug Service',
  yellow: 'Yellow — GEHP',
  green: 'Green — GEHP dependant',
} satisfies Record<SlipColour, string>

/** True/false when the pharmacy's type settles it; null when unconfirmed. */
export function acceptsSlip(
  pharmacy: Pharmacy,
  slip: SlipColour,
): boolean | null {
  if (pharmacy.type === 'government') return slip !== 'white'
  if (pharmacy.type === 'private-sbs') return slip === 'white'
  return null
}

/**
 * The closest pharmacy to `from` that definitely accepts the slip — used to
 * point people at a compatible facility when the current one cannot fill
 * their prescription. Null when `from` has no coordinates.
 */
export function nearestAccepting(
  from: Pharmacy,
  slip: SlipColour,
  pharmacies: ReadonlyArray<Pharmacy>,
): { pharmacy: Pharmacy; km: number } | null {
  if (!from.coords) return null
  let best: { pharmacy: Pharmacy; km: number } | null = null
  for (const candidate of pharmacies) {
    if (candidate === from || acceptsSlip(candidate, slip) !== true) continue
    const km = pharmacyDistanceKm(candidate, from.coords)
    if (km === null) continue
    if (!best || km < best.km) best = { pharmacy: candidate, km }
  }
  return best
}
