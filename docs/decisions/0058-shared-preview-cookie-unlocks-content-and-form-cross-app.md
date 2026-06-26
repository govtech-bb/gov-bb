# 0058 — A shared `preview` cookie unlocks content and form cross-app, and is a rollout gate not a confidentiality boundary

**Date:** 2026-06-25
**Status:** Accepted
**Related:** [#1646](https://github.com/govtech-bb/gov-bb/issues/1646) (Phase 3), [#1682](https://github.com/govtech-bb/gov-bb/issues/1682) (Phase 2), ADR-0011 (unpublished recipe preview is secret-gated per-request), ADR-0013 (content preview is a rollout gate, not a confidentiality boundary), ADR-0057 (env config validated with Zod at boot).

## Context

Phases 1 (#1646) and 2 (#1682) gave `apps/forms`/`apps/api` a `meta.visibility`
model (`public | preview | draft`) and a 404 gate, mirroring `apps/landing`'s
content visibility. But the two apps still gated **independently**: a reviewer
previewing a not-yet-public service had to present the token to landing (for the
content page) **and** again to forms (for the form). The two apps also used
different secret names (`PREVIEW_SECRET`/`DRAFT_SECRET` vs `RECIPE_PREVIEW_TOKEN`),
so one link could not unlock the whole journey.

Two facts constrain any cross-app solution:

- **`apps/forms` is a static, client-only SPA** (it deploys WEB, not
  WEB_COMPUTE — no Nitro / TanStack Start server runtime). It therefore cannot
  set an `httpOnly` cookie the way landing's SSR does.
- **A cookie can only be shared across apps when they are subdomain siblings of
  one parent** (e.g. `landing`, `forms`, `api` all under
  `*.sandbox.alpha.gov.bb`), so the cookie can be scoped `Domain=.<parent>`.

## Decision

**One shared `preview` cookie is the cross-app visibility grant, and it is a
forgeable rollout gate — not a confidentiality boundary** (the same posture
ADR-0013 took for landing content).

- **Landing's existing `preview` cookie is the grant.** It holds only the
  *level* (`preview`/`draft`, or legacy `1`), never a secret, `httpOnly`, 4h
  TTL. It is scoped to the parent domain via a new `PREVIEW_COOKIE_DOMAIN` env
  var (landing) / config value (API). Unset → host-only (local / Amplify
  previews degrade gracefully).
- **The API mints the cookie on behalf of forms.** Because forms is a static
  SPA, when the API receives a valid `X-Recipe-Preview` header (the SPA
  forwarding a `?preview=` URL token) it responds with a `Set-Cookie` that is
  **byte-identical** to landing's (name `preview`, `Domain`, `Path=/`, 4h,
  `HttpOnly`, `SameSite=Lax`) so the browser stores **one** cookie, not two.
  Landing keeps minting it server-side as before.
- **Cookie presence ⇒ visibility bypass only.** On any request the API treats
  the presence of a bypass-valued `preview` cookie as `bypassVisibility`. It
  **never** triggers DB-scratch sourcing — that still requires the per-request
  `X-Recipe-Draft` secret header (ADR-0011). A `draft`-level cookie bypasses
  *visibility* (hierarchical, mirroring landing) but still does not DB-source.
- **The secret is value-aligned, not renamed.** `RECIPE_PREVIEW_TOKEN` is set to
  the **same value** as landing's `PREVIEW_SECRET` per environment. This is an
  ops/deploy-config step, not a code change — no variable renames, no
  deploy-workflow surgery. `DRAFT_SECRET` and the `?draft=` path are untouched.

The split, made explicit:

| Path | Unlocked after first contact by | Posture |
|------|---------------------------------|---------|
| **Visibility bypass** — view/start a published-but-flagged form, and its landing "Start now" button | **cookie presence** (`preview`/`draft`/`1`) | forgeable rollout gate (this ADR, ADR-0013) |
| **DB-scratch sourcing** — serve the unpublished builder draft (`?draft=`) | **`X-Recipe-Draft` secret header, every request** — never cookie-persisted | secret-gated per-request (ADR-0011) |

## Consequences

- **A single `?preview=<token>` link previews the whole journey** (content →
  form → submit) on a custom-domain environment, in either entry order: the app
  that receives the token sets the shared cookie, and thereafter both apps honor
  it for the cookie's lifetime with no token in the URL.
- **The bypass is forgeable, by design.** Anyone can hand-set
  `Cookie: preview=preview` and view a non-public *published* form. This is
  acceptable because `visibility` is "not public yet", not "secret" — the same
  accepted limitation as ADR-0013. Material that must not be reachable needs a
  real auth mechanism, or the `form_disabled_overrides` 410 kill switch (which
  no token or cookie bypasses). The **DB-scratch** path is **not** forgeable —
  it stays secret-gated per request (ADR-0011).
- **Cross-app sharing works only on custom-domain environments** (sandbox /
  prod). On **per-PR Amplify previews** landing and forms are separate Amplify
  appIds under `*.amplifyapp.com` with no scopable shared parent, and previews
  hit the **deployed** sandbox API cross-site — so the `Domain=`/`SameSite=Lax`
  cookie is inert there. Previews degrade to the existing per-app URL-token
  behaviour, which keeps the per-PR preview smoke gate (ADR-0029/0030)
  unaffected.
- **Public Suffix List caveat.** `Domain`-scoped + `SameSite=Lax` sharing
  silently fails if the parent (`gov.bb` / `alpha.gov.bb`) is on the PSL. The
  apps already make credentialed cross-subdomain calls, so this is expected to
  hold — but it is a precondition, not an implementation detail.
- **The API mints the cookie additively.** Reading the cookie is a no-op unless
  one is present, and minting only happens on a valid `X-Recipe-Preview` header,
  so the API change is safe to ship before the forms/landing changes rely on it.
  **Sequencing caveat:** `Domain`-scoping must land in lockstep. Do not set
  `PREVIEW_COOKIE_DOMAIN` on the API until landing also sets the matching domain
  (deferred to the frontend PR). If only the API scopes `Domain=.<parent>` while
  landing stays host-only, the browser keeps two same-name/-path cookies and the
  "one shared grant" property does not hold. Until both are wired, leave
  `PREVIEW_COOKIE_DOMAIN` unset — the host-only cookie is harmless.
- **One secret now unlocks more.** Aligning the values means a leak of that
  single secret exposes both unlaunched content and the ability to mint the
  visibility cookie. It still does **not** expose DB scratch. Rotate by changing
  `RECIPE_PREVIEW_TOKEN` / `PREVIEW_SECRET` in lockstep across environments.
