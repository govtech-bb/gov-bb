# 0013 — Content preview is a rollout gate, not a confidentiality boundary

**Date:** 2026-05-27
**Status:** Accepted

## Context

`apps/landing` needed a way to roll content out gradually: keep a page (or its
digital service) hidden from the public while reviewers check it, then publish
by flipping a flag. The app is a TanStack Start SSR site with **no auth**, and
all content is loaded into the bundle at build time via
`import.meta.glob(..., { eager: true })` in `src/content/registry.ts`.

Two properties were chosen during planning (see
`docs/plans/content-feature-flagging.md`):

- **Audience:** a single shared **preview token**, not per-user accounts. A
  reviewer unlocks preview content with `?preview=<PREVIEW_SECRET>`, which sets
  an httpOnly cookie; `?preview=exit` clears it.
- **Secrecy:** preview pages are hidden from public *surfaces* but their markdown
  may still ship in the client bundle — acceptable because the content is "not
  ready", not secret.

That second choice is the load-bearing one, and it is easy to forget: because
gating is applied per-request at the routing/listing/search layer rather than by
excluding files from the build, the raw content is still downloadable by anyone
who inspects the bundle.

## Decision

**`visibility: preview` is a rollout gate, not a confidentiality boundary.**

When a page is `visibility: preview` (or inherits it from an ancestor — flagging
a service's `index.md` hides its `/start` and `/form` too):

- it 404s for the public and is dropped from category/service listings, the
  search index, and carries `noindex`;
- it is reachable only by a request holding the valid preview cookie;
- a still-public parent page whose `/start` sub-page is preview hides its
  online-application method and rewrites its "There are N ways…" count.

But preview content **still ships in the client bundle**. It is not encrypted,
not per-user access-controlled, and not excluded from the build. The
`PREVIEW_SECRET` is server-only (no `VITE_` prefix); the cookie holds only a
boolean grant, never the secret.

Therefore: **never use `visibility: preview` for embargoed, confidential, or
otherwise sensitive material.** It means "not ready for the public yet", nothing
stronger. Content that must not be downloadable until publication needs a
different mechanism — build-time exclusion of the source, or real
authentication — and is out of scope for this gate.

## Consequences

- The rollout gate is cheap and operates on the single artifact that ships to
  every environment, including production — no separate "staging" build.
- Reviewers can preview on any environment via the token, with no accounts.
- Anyone determined can read preview content out of the JS bundle. This is an
  accepted limitation, documented here so it is a deliberate constraint and not
  a latent surprise.
- The `visibility` enum (`public | preview`) is the seam for any future
  per-audience access; growing beyond a single shared token would not require
  re-plumbing the gate.
