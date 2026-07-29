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
  "Branford Taitt Polyclinic": "TEMP-RESTAURANT-LICENCE-BRANFORD-TAITT",
  "David Thompson Health & Social Services Complex":
    "TEMP-RESTAURANT-LICENCE-DAVID-THOMPSON",
  "Eunice Gibson Polyclinic": "TEMP-RESTAURANT-LICENCE-EUNICE-GIBSON",
  "Frederick Miller Polyclinic": "TEMP-RESTAURANT-LICENCE-FREDERICK-MILLER",
  "Maurice Byer Polyclinic": "TEMP-RESTAURANT-LICENCE-MAURICE-BYER",
  "Randal Phillips Polyclinic": "TEMP-RESTAURANT-LICENCE-RANDAL-PHILLIPS",
  "Sir Winston Scott Polyclinic": "TEMP-RESTAURANT-LICENCE-WINSTON-SCOTT",
  "St. Philip Polyclinic": "TEMP-RESTAURANT-LICENCE-ST-PHILIP",
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
