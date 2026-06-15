# Chat: one consistent, env-aware "go home" destination

## Context

[#1096](https://github.com/govtech-bb/gov-bb/issues/1096): the chat app had
three "go to the homepage" affordances pointing at three different places. The
header logo self-linked to the chat app's own `/` (so it went nowhere) while
carrying `aria-label="Go to the alpha.gov.bb homepage"`; the footer **Home**
hardcoded prod `https://alpha.gov.bb`; and **Close** read an env default of
`https://landing.sandbox.alpha.gov.bb`. So "home" resolved to the chat app, prod
landing, and sandbox landing depending on which control you clicked.

## What we did

- Added a single `LANDING_URL` constant (`src/config/landing.ts`), trailing
  slash stripped so callers append paths cleanly.
- Wired it through vite's `define` (`process.env.LANDING_URL`, `vite.config.ts`)
  with a prod default — the same build-time baking `FORMS_URL` already uses.
- Routed every affordance through it: footer **Home** + **Terms & Conditions**
  (`__root.tsx`), the header logo (`index.tsx` — now an external `<a href>`
  instead of `<Link to="/">`, aria-label now truthful), and **Close**.
- Retired the dead `VITE_LANDING_URL` read; documented `LANDING_URL` in
  `.env.example`.

## Why we did it that way

The issue suggested standardizing on the existing `import.meta.env.VITE_LANDING_URL`
pattern, but investigation showed that var is **read but never set** anywhere in
the repo (not in `amplify.yml`, not in vite's `define`) — so it always fell to
its hardcoded default. The app's *real* env-aware-URL mechanism is `process.env.X`
baked at build time via `define` (there's a comment in `vite.config.ts`
explaining Amplify Compute doesn't pass Console vars to the SSR Lambda at
runtime). We followed that path instead, so the landing URL is genuinely
environment-aware through the same route as `FORMS_URL`.

Default origin is **prod** (`https://alpha.gov.bb`), not sandbox. Because the var
isn't set in CI today, the default is what actually ships — and the live footer
already points at prod, so a sandbox default would have silently regressed
production footer/Terms to sandbox. Sandbox/preview builds set `LANDING_URL`
explicitly (documented in `.env.example`); that Amplify env wiring is infra,
outside this repo.

## What we almost got wrong

Verifying locally surfaced a **pre-existing** dev crash unrelated to this change:
`routes/index.tsx` imports `FEEDBACK_TRIGGER_PHRASE` from `chat/feedback.ts`,
which transitively pulls server-only `form/session.ts` → `node:crypto` into the
browser bundle and throws in dev (the feedback feature from
[#1112](https://github.com/govtech-bb/gov-bb/pull/1112)/[#1113](https://github.com/govtech-bb/gov-bb/pull/1113)).
We prototyped a fix (split the client-safe constants into their own module) and
verified it cleared the crash, but **reverted it** to keep this PR scoped to
#1096. The production build externalizes `node:crypto`, so it's a dev-only crash;
it still wants its own fix/issue.

## Open questions

- Set `LANDING_URL` in the sandbox Amplify environment so sandbox builds point at
  `landing.sandbox.alpha.gov.bb` (infra task, outside this repo).
- The `node:crypto` dev crash needs a separate fix — splitting the client-safe
  feedback constants out of `feedback.ts` is the prototyped approach.
