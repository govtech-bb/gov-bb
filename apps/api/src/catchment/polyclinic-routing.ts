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
 * Catchment → the suffix the CMS appends to a programme code. Not derivable
 * from the name — `Sir Winston Scott Polyclinic` → `WINSTON_SCOTT`, and the
 * Complex → `DAVID_THOMPSON` — so it stays a table. Keys are **serving**
 * catchment names (see `SERVING_CATCHMENT`): a catchment served by another
 * polyclinic has no key of its own, so there are seven keys over the eight
 * GeoJSON catchments, not eight. Keys must stay in lockstep with the GeoJSON
 * `properties.name` values — `CatchmentRoutingService.onModuleInit` throws at
 * boot if either side drifts.
 */
export const CATCHMENT_SUFFIX: Record<string, string> = {
  "Branford Taitt Polyclinic": "BRANFORD_TAITT",
  "David Thompson Health & Social Services Complex": "DAVID_THOMPSON",
  "Eunice Gibson Polyclinic": "EUNICE_GIBSON",
  "Maurice Byer Polyclinic": "MAURICE_BYER",
  "Randal Phillips Polyclinic": "RANDAL_PHILLIPS",
  "Sir Winston Scott Polyclinic": "WINSTON_SCOTT",
  "St. Philip Polyclinic": "ST_PHILIP",
};

/**
 * CMS queues whose codes do **not** follow `<programmeCode>_<suffix>`, keyed by
 * formId then serving catchment. Every entry is a fact about a real CMS queue,
 * not a preference — the CMS names its queues, we record them.
 *
 * `request-an-environmental-health-officer` is the whole map today: its webhook
 * `mapping.programmeCode` is `ENV_HEALTH_OFFICER_REQUEST` (the code the CMS
 * expects when no catchment resolves) while its per-catchment queues drop the
 * `_REQUEST` and read `ENV_HEALTH_OFFICER_*`. Two different code families for
 * one service, so none of its seven compose. Note also that its Randal Phillips
 * queue spells the place with two Ls — `ENV_HEALTH_OFFICER_RANDALL_PHILLIPS` —
 * unlike the GeoJSON catchment and every licence code, which use one. Confirmed
 * by the service owner (2026-08-10): deliberate, not a typo. Do not "fix" it,
 * and do not copy the two-L spelling into another form's codes.
 *
 * `CatchmentRoutingService.onModuleInit` throws at boot if an inner key is not
 * a serving catchment, so a stale override cannot linger after a CMS rename.
 */
export const PROGRAMME_CODE_OVERRIDES: Record<
  string,
  Record<string, string>
> = {
  "request-an-environmental-health-officer": {
    "Branford Taitt Polyclinic": "ENV_HEALTH_OFFICER_BRANFORD_TAITT",
    "David Thompson Health & Social Services Complex":
      "ENV_HEALTH_OFFICER_DAVID_THOMPSON",
    "Eunice Gibson Polyclinic": "ENV_HEALTH_OFFICER_EUNICE_GIBSON",
    "Maurice Byer Polyclinic": "ENV_HEALTH_OFFICER_MAURICE_BYER",
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
