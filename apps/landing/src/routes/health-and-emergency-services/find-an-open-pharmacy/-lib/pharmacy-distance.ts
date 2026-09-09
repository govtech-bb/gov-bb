/**
 * Distance helpers for the pharmacy finder's "Use my location" sort.
 * Pure functions; no DOM or browser APIs.
 */

import type { LatLon, Pharmacy } from '../-data/pharmacies'

const EARTH_RADIUS_KM = 6371

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Great-circle distance between two points in kilometres. */
function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Distance from the user to a pharmacy in km, or null when it has no pin. */
export function pharmacyDistanceKm(
  pharmacy: Pharmacy,
  user: LatLon | null,
): number | null {
  if (!user || !pharmacy.coords) return null
  return haversineKm(user, pharmacy.coords)
}

const VERY_CLOSE_KM = 0.5

/** Human-readable distance, e.g. "2.4 km away". */
export function formatDistanceKm(km: number): string {
  return km < VERY_CLOSE_KM ? 'Very close' : `${km.toFixed(1)} km away`
}
