/**
 * Routing data that is NOT in polyclinic-catchments.geojson. Keyed by the
 * GeoJSON `properties.name`. Emails live in the GeoJSON; only these two pieces
 * are ours.
 */

/**
 * Derived placeholder programme codes, one per catchment. The CMS will
 * eventually issue real per-polyclinic routing codes (env-specific); until then
 * these stable slugs make `programme_code` vary by location. Swap the values
 * when the CMS codes arrive — keys must stay in lockstep with the GeoJSON names.
 */
export const PROGRAMME_CODES: Record<string, string> = {
  "Branford Taitt Polyclinic": "TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT",
  "David Thompson Health & Social Services Complex":
    "TEMP_RESTAURANT_LICENCE_DAVID_THOMPSON",
  "Eunice Gibson Polyclinic": "TEMP_RESTAURANT_LICENCE_EUNICE_GIBSON",
  "Frederick Miller Polyclinic": "TEMP_RESTAURANT_LICENCE_FREDERICK_MILLER",
  "Maurice Byer Polyclinic": "TEMP_RESTAURANT_LICENCE_MAURICE_BYER",
  "Randal Phillips Polyclinic": "TEMP_RESTAURANT_LICENCE_RANDAL_PHILLIPS",
  "Sir Winston Scott Polyclinic": "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
  "St. Philip Polyclinic": "TEMP_RESTAURANT_LICENCE_ST_PHILIP",
};

/**
 * Parish select value (`components/parish`) → serving catchment, used only when
 * the submission has no usable coordinates. No parish maps to Branford Taitt or
 * Frederick Miller — those are reachable only by a coordinate hit.
 */
export const PARISH_DEFAULTS: Record<string, string> = {
  "st-lucy": "Maurice Byer Polyclinic",
  "st-peter": "Maurice Byer Polyclinic",
  "st-andrew": "Maurice Byer Polyclinic",
  "st-james": "Maurice Byer Polyclinic",
  "st-thomas": "Eunice Gibson Polyclinic",
  "st-joseph": "David Thompson Health & Social Services Complex",
  "st-john": "David Thompson Health & Social Services Complex",
  "st-george": "David Thompson Health & Social Services Complex",
  "st-philip": "St. Philip Polyclinic",
  "christ-church": "Randal Phillips Polyclinic",
  "st-michael": "Sir Winston Scott Polyclinic",
};
