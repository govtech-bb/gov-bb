/**
 * Routing data that is NOT geometry. Keyed by the GeoJSON `properties.name`.
 * The GeoJSON holds only the catchment shapes + names; the programme codes,
 * the parish fallback map, and the per-catchment MDA emails all live here.
 */

/**
 * CMS programme codes, keyed by **formId then catchment**, not by catchment
 * alone: one polyclinic catchment serves several services, and each service
 * has its own CMS queue, so the same catchment needs a different code per
 * form. Keys (both the formId and, within each form's map, the catchment
 * name) must stay in lockstep with the GeoJSON `properties.name` values —
 * `CatchmentRoutingService.onModuleInit` throws at boot if either drifts.
 *
 * `apply-for-temporary-restaurant-licence` codes are CMS-issued and must not
 * change here without a corresponding CMS rename.
 *
 * `request-an-environmental-health-officer` codes, and two things about them
 * that look like mistakes and are not (confirmed by the service owner,
 * 2026-08-10):
 *
 * - `Randal Phillips Polyclinic` (one L, matching the GeoJSON and the licence
 *   catchment name) has the CMS code `ENV_HEALTH_OFFICER_RANDALL_PHILLIPS`
 *   (two Ls). The CMS queue name and the catchment name simply spell the
 *   place differently — do not "fix" the code to one L, and do not derive
 *   either form's codes from the other by swapping a prefix.
 * - `Frederick Miller Polyclinic` has no Environmental Health Department and
 *   no officer-request queue of its own; its area falls under St. Philip, so
 *   officer requests there deliberately reuse `ENV_HEALTH_OFFICER_ST_PHILIP`.
 *   It cannot simply be omitted: the GeoJSON catchment still exists and is
 *   reachable by a coordinate hit (no parish maps to it), and every GeoJSON
 *   catchment must have a code for every form or boot throws.
 */
export const PROGRAMME_CODES_BY_FORM: Record<string, Record<string, string>> = {
  "apply-for-temporary-restaurant-licence": {
    "Branford Taitt Polyclinic": "TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT",
    "David Thompson Health & Social Services Complex":
      "TEMP_RESTAURANT_LICENCE_DAVID_THOMPSON",
    "Eunice Gibson Polyclinic": "TEMP_RESTAURANT_LICENCE_EUNICE_GIBSON",
    "Frederick Miller Polyclinic": "TEMP_RESTAURANT_LICENCE_FREDERICK_MILLER",
    "Maurice Byer Polyclinic": "TEMP_RESTAURANT_LICENCE_MAURICE_BYER",
    "Randal Phillips Polyclinic": "TEMP_RESTAURANT_LICENCE_RANDAL_PHILLIPS",
    "Sir Winston Scott Polyclinic": "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
    "St. Philip Polyclinic": "TEMP_RESTAURANT_LICENCE_ST_PHILIP",
  },
  "request-an-environmental-health-officer": {
    "Branford Taitt Polyclinic": "ENV_HEALTH_OFFICER_BRANFORD_TAITT",
    "David Thompson Health & Social Services Complex":
      "ENV_HEALTH_OFFICER_DAVID_THOMPSON",
    "Eunice Gibson Polyclinic": "ENV_HEALTH_OFFICER_EUNICE_GIBSON",
    // No officer-request queue of its own — see the note above. Deliberate,
    // not a typo: do not point this at a Frederick Miller code.
    "Frederick Miller Polyclinic": "ENV_HEALTH_OFFICER_ST_PHILIP",
    "Maurice Byer Polyclinic": "ENV_HEALTH_OFFICER_MAURICE_BYER",
    // Two Ls, unlike the catchment name and the licence code — see the note
    // above. Deliberate, not a typo.
    "Randal Phillips Polyclinic": "ENV_HEALTH_OFFICER_RANDALL_PHILLIPS",
    "Sir Winston Scott Polyclinic": "ENV_HEALTH_OFFICER_WINSTON_SCOTT",
    "St. Philip Polyclinic": "ENV_HEALTH_OFFICER_ST_PHILIP",
  },
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
