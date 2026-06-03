# Extend form-builder API uniqueness checks to published forms

**Issue:** [#556](https://github.com/govtech-bb/gov-bb/issues/556) (follows
[#545](https://github.com/govtech-bb/gov-bb/issues/545),
[ADR 0025](../decisions/0025-form-uniqueness-is-enforced-app-level-not-via-db-constraint.md))

## Context

#545 added app-level `title`/`formId` uniqueness to the form-builder API, but
the checks in `createFormHandler`/`updateFormHandler` saw only the drafts in
`form_definitions`. The builder UI mirror compares against the merged
**drafts + published** list, so a collision against a *published-only* form (no
local draft row) was blocked client-side but **accepted by the API**. A direct
API call — or a save during the brief forms-list loading window — could create
a form duplicating a published one. This was the asymmetry deliberately deferred
from #545 and recorded as the open consequence in ADR 0025.

## What we did

`apps/form_builder_api/src/routes/forms.ts`:

- Extracted **`fetchPublishedForms()`** — the single owner of the upstream
  `${API_BASE_URL}/form-definitions` consult: URL build, the SSRF protocol
  guard, a 2.5s `AbortController` timeout, and a discriminated result
  (`{ ok, data }` vs. `kind: "config" | "upstream"` failures) so callers decide
  the response.
- Rewired **`listPublishedHandler`** onto it, preserving its existing
  behaviour exactly — 500 for a bad `API_BASE_URL`, 502 for an upstream fault,
  with `upstreamStatus`/`upstreamBody` passed through.
- Added **`fetchPublishedFormsFailOpen()`** — returns `[]` on any failure and
  emits a `console.warn` so a silent outage (and the resulting weakening of the
  backstop) is observable.
- Extended **`createFormHandler`**: folds published `{formId, title}` into the
  title check and, when `isNew`, rejects a `formId` present in the published
  set. **`updateFormHandler`**: folds published titles into the rename check
  (formId isn't reassigned on update, so no published-formId check there).
- `findTitleCollisionInDb` now takes optional `publishedRows`; a small
  `publishedToTitleRows` adapter maps `{formId,title}` → the `FormTitleRow`
  shape and concatenates with the DB rows.

Docs: updated the `form-uniqueness.ts` scope note and ADR 0025's Consequences to
record the asymmetry as closed.

Tests (`forms.uniqueness.spec.ts`, `fetch` mocked): published-only title
collision (create), published-only formId collision (create, `isNew`), rename
into a published-only title, self-exclusion when the form is itself published,
and the fail-open paths — upstream reject, non-OK, timeout (fake timers +
abort-driven rejection), and a 200 with no `data` array. `forms.published.spec.ts`
updated to expect the new abort `signal` arg on `fetch`.

## Why we did it that way

- **Shared helper over inlining the fetch in each handler.** The proxy already
  owned the URL/parse/SSRF logic; duplicating it across three call sites was
  three ways to drift. The discriminated result keeps the one behavioural
  difference — proxy surfaces failures, write path swallows them — at the
  caller, not forked into two fetch implementations.
- **Fail-open, with a timeout.** Per the issue: a flaky upstream must not block
  all form creation, since the UI mirror still guards the interactive path.
  Fail-open alone only rescues an upstream that fails *fast*; adding the call to
  the write path means a *hang* would otherwise stall saves indefinitely, so the
  2.5s `AbortController` converts a hang into a fast failure that then fails
  open.
- **Coerce a malformed-but-OK body to `[]`.** Code review caught that the
  original `body.data` cast defeated fail-open: a 200 response missing the
  `{ data: [...] }` envelope (contract drift, a bare `null`) left `data`
  `undefined`, and the downstream `.some()`/`.map()` threw into a 500 — blocking
  every save, the exact outcome fail-open was meant to prevent. Guarding with
  `Array.isArray(body?.data) ? body.data : []` keeps a degraded upstream on the
  drafts-only fallback. A regression test covers it.
- **Both checks, not title-only.** A title-only extension would leave a
  published-only `formId` reusable via a direct API call; the UI checks both
  against the merged list, so the API matches.
