# 0063 — A `service_status` row fully overrides the static visibility seed

**Date:** 2026-07-08
**Status:** Accepted (amended 2026-07-08 — landing shipped via
[#1928](https://github.com/govtech-bb/gov-bb/pull/1928), which also gates
sitemap and search; see "Accepted gaps")
**Related:** [#1650](https://github.com/govtech-bb/gov-bb/issues/1650) (epic:
feature-flagging on `service_status`), [#1896](https://github.com/govtech-bb/gov-bb/issues/1896)
(forms API gate), [#1897](https://github.com/govtech-bb/gov-bb/issues/1897)
(landing page gate, implemented by
[#1928](https://github.com/govtech-bb/gov-bb/pull/1928)),
`docs/plans/1650-service-status-seed-migration.md`
(one-time seed), ADR 0030 (landing resolves availability at runtime,
last-known-good degradation model)

## Context

`service_status` (#1876/#1886) gave every service a slug-keyed row
(`enabled`/`form_disabled`/`disabled`) plus an audit trail and admin
read/write endpoints (#1898 UI in flight), but nothing consumed it yet: form
reachability was still decided entirely by the recipe's `meta.visibility`
(#1646), and the landing page's by the page's frontmatter `visibility`. An
admin could toggle a row and nothing would happen — the only way to change a
service's live visibility was still a code change and a redeploy.

The goal (#1650) is for a `PUT /service_status` toggle to take effect on the
live site **without a redeploy**. Two independent consumers read the recipe /
frontmatter visibility today — the forms API (`FormDefinitionsService`) and
landing (`resolvePageLevel` in `src/content/registry.ts`) — and both needed
the same override semantics so an admin sees one consistent mental model
across the site and its forms.

## Decision

**A `service_status` row, when present, FULLY overrides the recipe/frontmatter
visibility seed. Absent a row, the seed is used unchanged — an un-flagged
service behaves exactly as it did before this feature existed.**

Both consumers apply the same level mapping, translated to their own
visibility vocabulary:

| `service_status` | Forms API effective visibility                                                                                                                 | Landing page effective visibility                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `enabled`        | `public` — listed, reachable                                                                                                                   | `public`                                                                        |
| `form_disabled`  | `maintenance` — dropped from the public list, advertised on `/form-definitions/maintenance` (reuses the #1694 maintenance machinery wholesale) | page keeps its **frontmatter** level (stays up for public pages; the form side flows through the API automatically) |
| `disabled`       | `preview` — hidden; preview token/cookie bypass still works                                                                                    | `preview` — hidden unless the viewer holds the preview cookie                   |
| _(no row)_       | recipe `meta.visibility` (unchanged)                                                                                                           | frontmatter `visibility` (unchanged)                                            |

Consequences of "fully overrides," all intended:

- `enabled` can **raise** a `draft`/`preview` recipe or page to public — the
  admin's explicit, audited choice (every write goes through
  `service_status_audit_log`). This is not a bug to guard against; it is the
  point of the feature.
- `disabled` maps to `preview`, not `draft`, on the forms side: it gates
  _visibility_ only. The `draft` level's separate meaning (the form_builder
  DB-scratch row is the resolution source) is untouched — a `service_status`
  row never changes which recipe source gets read.
- `form_disabled` reuses the #1694 maintenance display wholesale on both
  sides: the API moves the form onto `/form-definitions/maintenance` and off
  the public list; landing's existing `available-forms`/`MaintenanceNotice`
  machinery already hides the Start button and shows the notice once the API
  reflects the change, with zero landing-specific code for this level.
  One asymmetry (amended 2026-07-08): on landing, `form_disabled` is the one
  value that does **not** override the page's own level — the shipped
  implementation (#1928) omits it from the visibility overlay, leaving the
  frontmatter in charge of the page while only the form is gated. In practice
  the two readings coincide: the seed only ever assigns `form_disabled` to
  services whose page is already public.
- Status rows are keyed by a slug namespace shared with landing content slugs
  (canonical slug = `formId` when the service has a form, else the landing
  content slug, per the #1898 spec). A row whose slug matches no known
  formId/content-slug is ignored by both consumers — the shared namespace
  means a row can legitimately belong to the other consumer only.

## Seeding

Absence-of-row was originally meant to _be_ the seed mechanism (every service
starts unflagged). That was superseded before either consumer shipped: a
one-time, insert-only migration (`docs/plans/1650-service-status-seed-migration.md`)
snapshots every service's current static visibility into `service_status` once
per environment, so the #1898 admin UI shows accurate state from day one
instead of defaulting every service to "enabled." Both consumers still keep
the no-row fallback described above — it now covers services created _after_
the seed ran, which degrade safely to their static visibility until an admin
first touches them.

## Freshness

The two consumers chose different freshness/complexity trade-offs, each
matching their existing architecture:

- **Forms API** reads `service_status` directly via `ServiceStatusService`
  (same process, same DB) on every request — no HTTP hop, no cache. One
  status read per request (a `list()` call for list endpoints, a `getStatus()`
  call for the single-recipe gate) is the freshness model: a toggle is live on
  the very next request.
- **Landing** fetches `service_status` over HTTP from the forms API and caches
  it for 60 seconds per server instance, following the same pattern ADR 0030
  established for `available-forms`: fail-open to last-known-good on a fetch
  error, and fail-open to the static frontmatter seed when there is no cache
  at all (cold start during an outage). A toggle is live within ~60 seconds,
  matching landing's existing availability-list staleness bound.

## Accepted gaps

- *(Amended 2026-07-08 — gap closed before it shipped.)* This ADR originally
  accepted that landing's `lib/sitemap.ts` and search indexing would stay
  frontmatter-only. The landing implementation that actually merged
  ([#1928](https://github.com/govtech-bb/gov-bb/pull/1928)) gates the sitemap
  and search on `service_status` as well, so a disabled page drops out of the
  sitemap and search results within the same ~60-second staleness bound as the
  rest of landing. No sitemap/search gap exists.
- `form_builder_api`'s separate disable mechanism (the builder's own 410) is a
  different, older system and is not reconciled with `service_status` by this
  decision.

## Consequences

- An admin's `PUT /service_status` toggle now has one observable, documented
  effect across both the form and its landing page, without a deploy.
- The recipe `meta.visibility` / frontmatter `visibility` fields are not
  deprecated — they remain the seed and the fallback for services with no row.
- Future consumers of visibility (if any) must apply the same "row overrides
  seed" rule via each app's own effective-visibility mapping, not a shared
  package — the forms API and landing gates are intentionally separate,
  file-disjoint implementations (see #1896/#1897), each translating the three
  `service_status` values into its own existing visibility vocabulary.
