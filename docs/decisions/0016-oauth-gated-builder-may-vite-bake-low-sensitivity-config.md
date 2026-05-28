# 0016 — OAuth-gated builder may VITE-bake low-sensitivity config

**Date:** 2026-05-28  
**Status:** Accepted

## Context

The `form_builder`'s "Preview form" link needed to carry the recipe preview
token so an author can view an **unpublished DB draft** — the forms app reads
`?preview=<token>` and forwards it to the API as the `X-Recipe-Preview` header.
The link is built in the **browser** by `app/lib/form-url.ts`, and per ADR 0005
browser config is read via `import.meta.env`, never `process.env`. For a value
to be readable there it must be `VITE_`-prefixed — which means Vite **bakes it
into the builder's JS bundle**.

This is the exact exposure the public `apps/forms` app **deliberately
declined**: its `.env.example` notes there is intentionally no `VITE_` var for
the preview token because "a `VITE_` value would be baked into the public
bundle." The two apps face the same mechanism but differ in one respect that
matters: `apps/forms` serves a world-readable bundle, whereas `apps/form_builder`
is gated behind **GitHub OAuth** (org + team membership), so its bundle is not
world-readable.

An alternative was considered and rejected: keep the token server-only
(`RECIPE_PREVIEW_TOKEN`, no `VITE_`) and surface it to the browser through a
TanStack loader / server function so it is never statically baked. More
machinery for no meaningful gain given the OAuth gate.

## Decision

In the OAuth-gated `apps/form_builder`, browser config **may** be exposed via
`VITE_` vars — and thus baked into the JS bundle — even for values the public
`apps/forms` app keeps server-only. This is permitted only for
**low-sensitivity** values whose exposure to authenticated authors is
acceptable. Genuine secrets (API keys, session secrets, DB credentials) never
get a `VITE_` var regardless of the OAuth gate; they stay server-side.

Today's instance: `VITE_RECIPE_PREVIEW_TOKEN` (default `"demo"`) is baked into
the builder bundle so `formPreviewUrl` can append `?preview=<token>`.

## Consequences

**Positive:**
- The preview link is built with the same simple `import.meta.env` pattern that
  `VITE_FORMS_URL` already uses — no loader/server-function machinery.
- One consistent rule for where builder browser config comes from.

**Negative / tradeoffs:**
- The preview token is visible to anyone who passes the OAuth gate and inspects
  the bundle. Accepted because the token only unlocks viewing **unpublished
  drafts**, and only for authenticated form authors who can already create and
  publish forms.
- The forms app and the builder now treat the same token differently. Anyone
  reasoning about token exposure must keep the gating distinction in mind — this
  record is that reminder.

**Boundary:**
- The split is **gating-based, not value-based**: it is the OAuth gate that makes
  the exposure acceptable, not the token being "not very secret." Do not
  generalize this to ungated surfaces.
- The token only unlocks drafts end-to-end if the API's `RECIPE_PREVIEW_TOKEN`
  matches (e.g. both `"demo"` in dev). That API-side config is out of scope here.
