/**
 * Routing data that is NOT geometry. Keyed by the GeoJSON `properties.name`.
 * The GeoJSON holds only the catchment shapes + names; the programme codes,
 * the parish fallback map, and the per-catchment MDA emails all live here.
 */

/**
 * The CMS-issued per-polyclinic routing codes, one per catchment. These began
 * as derived placeholders; MOH then created the CMS programmes using exactly
 * these codes, so the values are now the real thing and must not be renamed
 * unilaterally — a change here has to be made in the CMS first (#2150 §6).
 * Staging and prod share one set of codes. Keys must stay in lockstep with the
 * GeoJSON names (a mismatch throws at boot, by design).
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
 * `properties.name`. All 8 still point at the shared test inbox
 * (`testing@govtech.bb`); the Ministry-confirmed addresses land as part of the
 * production cutover (#2211).
 *
 * This file is shared by every environment — there is no per-env copy — so what
 * keeps staging from emailing a real polyclinic is not this data but
 * `EmailProcessor.resolveCatchmentRecipient`, which overrides the resolved
 * address with the test inbox (logged `DEFAULTED`) unless
 * `MDA_REQUIRE_RECIPIENT` is set. Keep that guard in mind before editing here.
 *
 * A catchment with no entry resolves to `mdaEmail: null` (the service warns at
 * boot and, in production, a coordinate hit there fails the MDA email loudly,
 * isolated/DLQ'd, rather than misrouting).
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
