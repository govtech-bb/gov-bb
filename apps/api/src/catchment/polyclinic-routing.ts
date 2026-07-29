/**
 * Routing data that is NOT geometry. Keyed by the GeoJSON `properties.name`.
 * The GeoJSON holds only the catchment shapes + names; the programme codes,
 * the parish fallback map, and the per-catchment MDA emails all live here.
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

/**
 * Per-catchment MDA (Environmental Health) inbox, keyed by the GeoJSON
 * `properties.name`. All 8 currently point at the shared **test inbox**
 * (`testing@govtech.bb`) so no environment can email the real polyclinics
 * during testing — swap in the Ministry-confirmed per-catchment inboxes before
 * production. A catchment with no entry here would resolve to `mdaEmail: null`
 * (the service warns at boot and a coordinate hit there fails the MDA email
 * loudly, isolated/DLQ'd, rather than misrouting).
 */
export const POLYCLINIC_EMAILS: Record<string, string> = {
  "Branford Taitt Polyclinic": "testing@govtech.bb",
  "David Thompson Health & Social Services Complex": "testing@govtech.bb",
  "Eunice Gibson Polyclinic": "testing@govtech.bb",
  "Frederick Miller Polyclinic": "testing@govtech.bb",
  "Maurice Byer Polyclinic": "testing@govtech.bb",
  "Randal Phillips Polyclinic": "testing@govtech.bb",
  "Sir Winston Scott Polyclinic": "testing@govtech.bb",
  "St. Philip Polyclinic": "testing@govtech.bb",
};
