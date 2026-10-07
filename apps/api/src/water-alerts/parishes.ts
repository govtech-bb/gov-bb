/**
 * The 11 parishes of Barbados. Values match the slugs used by the platform's
 * `parish` form component (e.g. "saint-michael", "christ-church"). Centroids
 * are kept for map/labelling use.
 *
 * Ported from the "Wuh Water Doing?" prototype (src/lib/parishes.ts). The
 * client-side geolocation/point-in-polygon helpers stay in the landing app;
 * the API only needs the parish list, lookups, and area labels.
 */
export interface Parish {
  value: string;
  label: string;
  lat: number;
  lon: number;
}

export const PARISHES: Parish[] = [
  { value: "christ-church", label: "Christ Church", lat: 13.07, lon: -59.53 },
  { value: "saint-andrew", label: "St. Andrew", lat: 13.23, lon: -59.57 },
  { value: "saint-george", label: "St. George", lat: 13.13, lon: -59.55 },
  { value: "saint-james", label: "St. James", lat: 13.18, lon: -59.63 },
  { value: "saint-john", label: "St. John", lat: 13.16, lon: -59.47 },
  { value: "saint-joseph", label: "St. Joseph", lat: 13.2, lon: -59.53 },
  { value: "saint-lucy", label: "St. Lucy", lat: 13.31, lon: -59.61 },
  { value: "saint-michael", label: "St. Michael", lat: 13.1, lon: -59.61 },
  { value: "saint-peter", label: "St. Peter", lat: 13.25, lon: -59.63 },
  { value: "saint-philip", label: "St. Philip", lat: 13.13, lon: -59.45 },
  { value: "saint-thomas", label: "St. Thomas", lat: 13.17, lon: -59.58 },
];

export function findParish(value: string): Parish | undefined {
  return PARISHES.find((p) => p.value === value);
}

/** Human label for a stored area value ("all" or a parish slug). */
export function areaLabelFor(area: string): string {
  return area === "all" ? "all of Barbados" : (findParish(area)?.label ?? area);
}
