import { readFileSync } from "node:fs";
import path from "node:path";
import { isWithinBarbados } from "@/geocode/geocode-result";
import { inRing } from "./catchment-geometry.service";

/**
 * The parish a point lies in — for an address the geocoder placed but did not
 * name a parish for (Google has none for some places, e.g. Kensington Mall).
 *
 * Point-in-polygon against geoBoundaries' generalised parish outlines
 * (`parish-boundaries.geojson`, CC BY 4.0 — the same data the landing app's
 * water-outages page uses). The coastline is approximate, so a point just off
 * it falls in no polygon; it then takes the parish of the nearest outline
 * within {@link COAST_TOLERANCE_METRES}, which on a coast is the parish it sits
 * beside. A point further out is at sea and has no parish.
 *
 * Returns the `components/parish` select value (e.g. `st-michael`), or "" for a
 * point outside Barbados or at sea.
 */
// How far off the generalised coastline a real coastal address can fall. The
// outlines are coarse (segments of up to 8 km): on the St Philip coast the real
// shore is up to ~630 m outside them (Bottom Bay), so 1 km keeps a margin.
const COAST_TOLERANCE_METRES = 1000;
const METRES_PER_DEGREE = 111_320;

export function parishAt(lat: number, lon: number): string {
  if (!isWithinBarbados(lat, lon)) return "";

  const parishes = boundaries();
  for (const { parish, polygons } of parishes) {
    if (polygons.some((rings) => inPolygon(lon, lat, rings))) return parish;
  }

  // Metres east and north of the point, flat over a few hundred metres.
  const kx = METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  const toMetres = ([x, y]: [number, number]): [number, number] => [
    (x - lon) * kx,
    (y - lat) * METRES_PER_DEGREE,
  ];
  let nearest = "";
  let best = COAST_TOLERANCE_METRES;
  for (const { parish, polygons } of parishes) {
    for (const [outer] of polygons) {
      for (let i = 1; i < outer.length; i++) {
        const distance = distanceToSegment(
          toMetres(outer[i - 1]),
          toMetres(outer[i]),
        );
        if (distance <= best) {
          best = distance;
          nearest = parish;
        }
      }
    }
  }
  return nearest;
}

/** Distance from the origin to the segment a–b. */
function distanceToSegment(
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(Math.max(-(ax * dx + ay * dy) / lengthSquared, 0), 1);
  return Math.hypot(ax + t * dx, ay + t * dy);
}

type Ring = [number, number][];
interface ParishShape {
  parish: string;
  /** Each polygon is [outer ring, ...holes]; points are [lon, lat]. */
  polygons: Ring[][];
}

let cached: ParishShape[] | undefined;

function boundaries(): ParishShape[] {
  if (cached) return cached;
  const file = path.resolve(__dirname, "parish-boundaries.geojson");
  const collection = JSON.parse(readFileSync(file, "utf8")) as {
    features: {
      properties: { parish: string };
      geometry:
        | { type: "Polygon"; coordinates: Ring[] }
        | { type: "MultiPolygon"; coordinates: Ring[][] };
    }[];
  };
  cached = collection.features.map(({ properties, geometry }) => ({
    parish: properties.parish,
    polygons:
      geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [geometry.coordinates],
  }));
  return cached;
}

/** Inside the outer ring but in none of the holes. */
function inPolygon(lon: number, lat: number, rings: Ring[]): boolean {
  return (
    inRing(lon, lat, rings[0]) &&
    !rings.slice(1).some((hole) => inRing(lon, lat, hole))
  );
}
