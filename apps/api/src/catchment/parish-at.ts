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
 * it falls in no polygon; it then takes the parish of the nearest boundary
 * vertex, which on a coast is the parish it sits beside.
 *
 * Returns the `components/parish` select value (e.g. `st-michael`), or "" for a
 * point outside Barbados.
 */
export function parishAt(lat: number, lon: number): string {
  if (!isWithinBarbados(lat, lon)) return "";

  const parishes = boundaries();
  for (const { parish, polygons } of parishes) {
    if (polygons.some((rings) => inPolygon(lon, lat, rings))) return parish;
  }

  let nearest = "";
  let best = Infinity;
  for (const { parish, polygons } of parishes) {
    for (const rings of polygons) {
      for (const [x, y] of rings[0]) {
        const distance = (x - lon) ** 2 + (y - lat) ** 2;
        if (distance < best) {
          best = distance;
          nearest = parish;
        }
      }
    }
  }
  return nearest;
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
