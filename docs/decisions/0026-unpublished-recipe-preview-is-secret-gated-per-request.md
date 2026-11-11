# 0026 — Unpublished recipe preview is a secret-gated, per-request exception

**Date:** 2026-05-27
**Status:** Deprecated (2026-11-10, #3120): about `apps/api`, a v1 app; kept as a historical record. Previously: Accepted (re-scoped 2026-06-25 — see Update below)
**Related:** [#219](https://github.com/govtech-bb/gov-bb/issues/219), ADR-0017 (runtime recipes load from files, not `form_definitions`), #145 (files-only runtime), [#1682](https://github.com/govtech-bb/gov-bb/issues/1682) (token split), [#1646](https://github.com/govtech-bb/gov-bb/issues/1646) (visibility), ADR-0099 (shared preview cookie).

## Update (2026-06-25 — #1682 Phase 2 / #1646 Phase 3)

When this ADR was written, the `X-Recipe-Preview` header carried **both**
meanings: it bypassed visibility *and* sourced the unpublished DB scratch.
#1682 split those into two independent, token-validated headers, and #1646
Phase 3 moved the visibility bypass onto a forgeable cookie. This ADR is now
**re-scoped to the DB-scratch sourcing path only**:

- **This ADR governs the `?draft=` / `X-Recipe-Draft` path** — serving the
  in-progress `form_definitions` scratch. All four binding properties below
  (secret-gated per-request, constant-time + fail-closed, does-not-mutate
  `source()`, read-only) continue to apply to it, unchanged. DB scratch is
  **never** cookie-persisted: it requires the secret header on **every**
  request.
- **The published-form *visibility* bypass is no longer governed here.** It is a
  forgeable rollout gate (cookie/token *presence*, not DB sourcing) — see
  ADR-0099 and ADR-0028. A valid `X-Recipe-Preview` token, or a shared `preview`
  cookie, bypasses the #1646 404 gate to serve the **published** recipe; it does
  **not** read the DB.
- **The disabled-form 410 kill switch** (`form_disabled_overrides`) still
  precedes everything and is bypassed by neither token nor cookie.

Read every "preview" reference below as the **DB-scratch** path. The `secret`,
`constant-time`, `fail-closed`, `read-only` requirements are exactly what keep
that path from reopening #145; ADR-0099's forgeable cookie deliberately does
**not** touch it.

## Context

ADR-0017 made files the only runtime recipe source on end-user paths: `RECIPE_SOURCE=db`/`both` are honored only when `NODE_ENV=development`, and the prod gate lives in `FormDefinitionsService.source()` so no caller has to remember it. That closed #145 — unpublished `form_definitions` scratch can't leak to end users.

But operators still need to preview an **unpublished** draft against a real deployment (including staging/prod) before publishing — without flipping the whole server into DB mode and without exposing drafts to ordinary traffic. A naive reading of ADR-0017 says "never read the DB on a deployed end-user path," which would block this outright; a naive implementation (e.g. mutating `source()`, or a `?preview=` that any visitor could guess) would reopen #145.

We need a bounded exception, defined tightly enough that it can't erode the ADR-0017 guarantee.

## Decision

**The only sanctioned way to surface an unpublished `form_definitions` recipe on a deployed environment is a per-request preview that is secret-gated, constant-time-verified, fail-closed-when-unset, and read-only.** Concretely, the exception must satisfy all of:

- **Secret-gated, per-request.** The bypass is carried by a single request (the `X-Recipe-Preview` HTTP header on `GET /form-definitions/:formId`), compared against the `RECIPE_PREVIEW_TOKEN` env secret. It never changes server-wide state.
- **Constant-time + fail-closed.** The compare is `timingSafeEqual` over SHA-256 digests of both values. An empty/unset `RECIPE_PREVIEW_TOKEN` disables the feature entirely — no `"" === ""` match. A wrong or absent token is byte-identical to normal files-only behaviour.
- **Does not mutate `source()` and does not widen `RECIPE_SOURCE`.** The per-request `preview` flag selects the `both` resolution path for that one request only; the server-wide `NODE_ENV`/`RECIPE_SOURCE` gate from ADR-0017 is untouched.
- **Read-only.** Preview never reaches a write path. `FormDraftsService.create()` keeps calling `getRecipe` with no preview flag — end-user draft creation must never pin to an unpublished recipe.
- **Cache-isolated.** Preview responses carry `Cache-Control: no-store`, and any per-request variant is folded into the client query-cache keys (see the session summary for the two-tier-cache invariant) so a preview body can never be served to an untokened request.

This is a **bounded exception to ADR-0017, not a reversal of it.** ADR-0017 remains in force for every request that does not carry a valid token.

## Consequences

- **Seeing a DB read on an end-user path is no longer automatically a #145 regression** — but only when it is reached through the preview gate above. Any DB read on a public path that is *not* secret-gated + constant-time + fail-closed + read-only is still a regression of ADR-0017. Reviewers should check for exactly those four properties.
- **Future per-request escape hatches around the files-only runtime must follow this same shape.** If another reason to bypass the gate arises, gate it per-request behind a secret with a constant-time compare and a fail-closed default; do not add another server-wide mode and do not mutate `source()`.
- **The token is an operational secret.** Rotate it by changing `RECIPE_PREVIEW_TOKEN` in the deployment (documented in `apps/api/.env.example`); rotation invalidates outstanding preview links immediately. There is deliberately no `VITE_` token on the forms side — a `VITE_` value would ship in the public bundle.
- **Known limitation (accepted).** With no `?version=`, preview reuses the `both` semver-comparison: a draft whose version is *lower* than the published file is shadowed by the file. The operator workaround is to append `?version=<draftVersion>`; see #219.
