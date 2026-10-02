import { POLYCLINIC_CONTACTS } from "@govtech-bb/form-conditions";

/**
 * Routing data that is NOT geometry. The GeoJSON holds only the catchment
 * shapes + names; the serving-catchment redirects, the programme codes and the
 * parish fallback map live here.
 *
 * The per-catchment MDA inboxes used to live here too. They are now rows in
 * `catchment_contact` (see `CatchmentContactService`), so an environment can
 * hold its own real addresses and rotating one needs no deploy. That does not
 * cover `CATCHMENT_CONTACT` below — a published citizen-facing contact line is
 * a different thing from a private notification inbox; see its own note.
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
 * Serving catchment → the single contact line shown on the confirmation page
 * and in the applicant email for a form routed to that catchment. Keys are
 * **serving** catchment names (redirected catchments have no row of their own —
 * Frederick Miller resolves to St. Philip's row). The line names the same
 * polyclinic the `{polyclinic}` token renders so the confirmation body can't
 * pair a name with another clinic's details (#254).
 *
 * Not restated here: this *is* `POLYCLINIC_CONTACTS` from
 * `@govtech-bb/form-conditions`, which also derives the `{polyclinicContact}`
 * all-clinics fallback from the same rows — the routed single line and the
 * fallback are one table, so they cannot drift. Aliased under the local
 * `CATCHMENT_*` name because `CatchmentRoutingService` validates it at boot
 * alongside `CATCHMENT_SUFFIX` and against the same GeoJSON catchment names.
 *
 * Unlike the MDA inboxes this file gave up to `catchment_contact`, these are
 * the *published* phone/email a citizen is told to call, not a private
 * notification address, and they change on the Ministry's timescale rather than
 * an environment's — so they stay in code and rotating one is a deploy. If that
 * becomes the wrong trade they belong as columns on `catchment_contact`, read at
 * response time the way `resolveMdaEmail` already is — tracked in #2661.
 */
export const CATCHMENT_CONTACT = POLYCLINIC_CONTACTS;
