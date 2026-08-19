/**
 * Routing data that is NOT geometry. The GeoJSON holds only the catchment
 * shapes + names; the serving-catchment redirects, the programme codes, the
 * parish fallback map, and the per-catchment MDA emails all live here.
 */

/**
 * GeoJSON catchment → the polyclinic whose Environmental Health Department
 * actually serves it, for the catchments where those differ. Applied to the
 * **whole** resolution: the programme code, the MDA inbox, and the polyclinic
 * named in the `{polyclinic}` token on the confirmation page and in the
 * applicant email. A catchment absent from here serves itself.
 *
 * `Frederick Miller Polyclinic` has no Environmental Health Department of its
 * own; its area falls under St. Philip. It stays a real catchment in the
 * GeoJSON — that geometry is the true primary-care catchment and is reachable
 * by a coordinate hit (no parish maps to it) — but nothing routed by it should
 * ever name Frederick Miller. Redirecting here rather than dissolving the
 * polygon into St. Philip keeps the geography honest and keeps the name, the
 * code, and the inbox from drifting apart, which is exactly how the
 * confirmation page came to name a polyclinic the submission had not gone to.
 *
 * Both the key and the value must name real GeoJSON catchments, and a value
 * must not itself be redirected (no chains) — `CatchmentRoutingService`
 * throws at boot otherwise.
 */
export const SERVING_CATCHMENT: Record<string, string> = {
  "Frederick Miller Polyclinic": "St. Philip Polyclinic",
};

/**
 * CMS programme codes, keyed by **formId then serving catchment**, not by
 * catchment alone: one polyclinic catchment serves several services, and each
 * service has its own CMS queue, so the same catchment needs a different code
 * per form. The inner keys are **serving** catchment names (see
 * `SERVING_CATCHMENT`) — a catchment served by another polyclinic has no key
 * of its own, so each form has seven keys over the eight GeoJSON catchments,
 * not eight. Keys must stay in lockstep with the GeoJSON `properties.name`
 * values — `CatchmentRoutingService.onModuleInit` throws at boot if either the
 * formId or a catchment name drifts.
 *
 * `apply-for-temporary-restaurant-licence` codes are CMS-issued and must not
 * change here without a corresponding CMS rename.
 *
 * `request-an-environmental-health-officer` has one code that looks like a
 * mistake and is not (confirmed by the service owner, 2026-08-10):
 * `Randal Phillips Polyclinic` (one L, matching the GeoJSON and the licence
 * catchment name) has the CMS code `ENV_HEALTH_OFFICER_RANDALL_PHILLIPS` (two
 * Ls). The CMS queue name and the catchment name simply spell the place
 * differently — do not "fix" the code to one L, and do not derive either
 * form's codes from the other by swapping a prefix.
 */
export const PROGRAMME_CODES_BY_FORM: Record<string, Record<string, string>> = {
  "apply-for-temporary-restaurant-licence": {
    "Branford Taitt Polyclinic": "TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT",
    "David Thompson Health & Social Services Complex":
      "TEMP_RESTAURANT_LICENCE_DAVID_THOMPSON",
    "Eunice Gibson Polyclinic": "TEMP_RESTAURANT_LICENCE_EUNICE_GIBSON",
    "Maurice Byer Polyclinic": "TEMP_RESTAURANT_LICENCE_MAURICE_BYER",
    "Randal Phillips Polyclinic": "TEMP_RESTAURANT_LICENCE_RANDAL_PHILLIPS",
    "Sir Winston Scott Polyclinic": "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
    "St. Philip Polyclinic": "TEMP_RESTAURANT_LICENCE_ST_PHILIP",
  },
  // PROVISIONAL — these follow the temp-licence naming convention but have NOT
  // been issued by the CMS yet. They exist so the ongoing restaurant licence
  // routes end-to-end while it is `visibility: preview`; every one must be
  // confirmed against a real CMS queue before the form goes public, exactly as
  // the temp-licence codes were. Note the irregularity above is NOT copied
  // blindly: `Randal Phillips` keeps the one-L spelling used by the licence
  // codes (the two-L `RANDALL` is specific to the officer-request queue).
  "apply-for-restaurant-licence": {
    "Branford Taitt Polyclinic": "RESTAURANT_LICENCE_BRANFORD_TAITT",
    "David Thompson Health & Social Services Complex":
      "RESTAURANT_LICENCE_DAVID_THOMPSON",
    "Eunice Gibson Polyclinic": "RESTAURANT_LICENCE_EUNICE_GIBSON",
    "Maurice Byer Polyclinic": "RESTAURANT_LICENCE_MAURICE_BYER",
    "Randal Phillips Polyclinic": "RESTAURANT_LICENCE_RANDAL_PHILLIPS",
    "Sir Winston Scott Polyclinic": "RESTAURANT_LICENCE_WINSTON_SCOTT",
    "St. Philip Polyclinic": "RESTAURANT_LICENCE_ST_PHILIP",
  },
  "request-an-environmental-health-officer": {
    "Branford Taitt Polyclinic": "ENV_HEALTH_OFFICER_BRANFORD_TAITT",
    "David Thompson Health & Social Services Complex":
      "ENV_HEALTH_OFFICER_DAVID_THOMPSON",
    "Eunice Gibson Polyclinic": "ENV_HEALTH_OFFICER_EUNICE_GIBSON",
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
 * Per-catchment MDA (Environmental Health) inbox, keyed by the **serving**
 * catchment (see `SERVING_CATCHMENT`). All 7 currently point at the shared
 * **test inbox** (`testing@govtech.bb`) so no environment can email the real
 * polyclinics during testing — swap in the Ministry-confirmed inboxes before
 * production. A catchment with no entry here would resolve to `mdaEmail: null`
 * (the service warns at boot and a coordinate hit there fails the MDA email
 * loudly, isolated/DLQ'd, rather than misrouting).
 */
export const POLYCLINIC_EMAILS: Record<string, string> = {
  "Branford Taitt Polyclinic": "testing@govtech.bb",
  "David Thompson Health & Social Services Complex": "testing@govtech.bb",
  "Eunice Gibson Polyclinic": "testing@govtech.bb",
  "Maurice Byer Polyclinic": "testing@govtech.bb",
  "Randal Phillips Polyclinic": "testing@govtech.bb",
  "Sir Winston Scott Polyclinic": "testing@govtech.bb",
  "St. Philip Polyclinic": "testing@govtech.bb",
};
