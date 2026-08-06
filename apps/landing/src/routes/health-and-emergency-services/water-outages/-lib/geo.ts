/**
 * Parish lookup from GPS coordinates using real Barbados parish boundaries.
 *
 * This does genuine point-in-polygon containment against the actual parish
 * outlines, so a position resolves to the parish that truly contains it —
 * accurate at parish boundaries, unlike the old "nearest centre point" guess
 * which could pick a neighbouring parish near a border.
 *
 * Boundary data: geoBoundaries gbOpen ADM1 for Barbados (CC BY 4.0),
 * https://www.geoboundaries.org — stored in ./parish-boundaries.json. It is
 * generalised (not survey-grade) and coastlines are approximate, so a point
 * just off the coast can fall outside every polygon. In that case we fall back
 * to the nearest parish centroid and tell the user it's our best guess.
 */
import { nearestParish } from './parishes'

type Geometry = {
  type: 'Polygon' | 'MultiPolygon'
  // Polygon: [ring][point][lon, lat]; MultiPolygon: [polygon][ring][point][lon, lat].
  coordinates: number[][][] | number[][][][]
}
export type ParishBoundaries = Record<string, Geometry>

/** Ray-casting test: is [lon, lat] inside this single linear ring? */
function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crosses =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

/** Inside the polygon's outer ring but outside any hole? Handles MultiPolygon. */
function inGeometry(lon: number, lat: number, geom: Geometry): boolean {
  const polygons = (
    geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
  ) as number[][][][]
  for (const rings of polygons) {
    if (!inRing(lon, lat, rings[0])) continue
    // rings[1..] are holes; a point in a hole is not in the polygon.
    const inHole = rings.slice(1).some((hole) => inRing(lon, lat, hole))
    if (!inHole) return true
  }
  return false
}

/** Slug of the parish whose boundary contains this position, or null. */
export function parishAt(
  lat: number,
  lon: number,
  boundaries: ParishBoundaries,
): string | null {
  for (const [slug, geom] of Object.entries(boundaries)) {
    if (inGeometry(lon, lat, geom)) return slug
  }
  return null
}

/**
 * Resolve a GPS position to a parish. `exact` is true when the point falls
 * inside a parish boundary; false when we had to fall back to the nearest
 * parish (e.g. a reading just off the coast). Returns null only if there are
 * no parishes to match against at all.
 */
export async function locateParish(
  lat: number,
  lon: number,
): Promise<{ value: string; exact: boolean } | null> {
  try {
    const mod = await import('./parish-boundaries.json')
    const boundaries = (mod.default ?? mod) as unknown as ParishBoundaries
    const hit = parishAt(lat, lon, boundaries)
    if (hit) return { value: hit, exact: true }
  } catch {
    // Boundary data unavailable — fall through to the centroid estimate.
  }
  const nearest = nearestParish(lat, lon)
  return nearest ? { value: nearest, exact: false } : null
}
