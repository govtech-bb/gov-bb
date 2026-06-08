# 2026-06-08 — Form-builder editing presence / read-only lock (#874)

## Context

Issue #874, the follow-up to #873 (ADR 0041). The deploy guards stop two
deploys colliding on a *version*; this removes the cause — two people editing
the same form unaware of each other — by making concurrent editing visible and
the second editor's session read-only. Executed a pre-written plan
(`docs/plans/874-…`, TDD, subagents for orientation/review) on worktree branch
`form-builder-editing-presence-874` off `sandbox`.

## What we did

Three layers, bottom-up (see ADR 0042 for the principles):

- **`packages/database`**: `FormEditingSessionEntity` (unique on `form_id`;
  `user_login`, `claimed_at`, `last_activity_at`) + migration
  `1780924594196`, wired into the entity/migration barrels and arrays. Migration
  smoke spec lives in `apps/api` (rolled-back transaction; savepoint-isolated
  unique-constraint check), runs against the live local DB.
- **`apps/form_builder_api`**: `routes/presence.ts` — `PUT` (claim/heartbeat,
  atomic conditional upsert), `GET` (fresh holder), `DELETE` (mine-only release)
  — plus the shared `holdsFreshClaim` helper. Mounted under `/builder/forms`.
  409 `presence_conflict` enforcement added to `createFormHandler` (non-new),
  `updateFormHandler`, `rekeyFormHandler`, and `publish.ts`. Unit spec mocks the
  DB; a `HAS_DB`-guarded `presence.db.spec.ts` proves the conditional-upsert
  semantics against real Postgres.
- **`apps/form_builder`**: `server/presence.ts` (`claimPresence` /
  `getPresence` / `releasePresence`, stamping `session.login`); `userLogin`
  threaded into `submitRecipe` / `updateRecipe` / `rekeyRecipe` / the publish
  reservation; `usePresence` hook; `PresenceBanner`; read-only gating in the
  toolbar, both modals, and `builder/index.tsx`.

## Why we did it that way

- **Read-only, not advisory.** Consciously overrode the issue's "advisory only /
  no hard locks" stance: a read-only second session sidesteps concurrent
  field-state syncing entirely, which is the real cost of advisory editing.
- **One `claimPresence` cadence does everything.** The hook re-syncs every 30s
  with a single `claimPresence` call: it's a heartbeat when I hold the claim, an
  atomic takeover when the claim is free/stale, and a read-only signal
  (`held:false` + holder) when someone else holds it fresh. So one call covers
  heartbeat + poll + handover; no separate `getPresence` polling loop. (The
  `getPresence` server fn is kept as the thin client for the GET route, though
  the hook doesn't need it.)
- **Brand-new creation (`isNew`) is exempt from the gate.** The plan's literal
  "must hold the claim, 409 otherwise" would 409 the first save of a new form
  (no claim exists yet) and force claiming half-typed form ids. A new form has
  no concurrent editor and `formId` uniqueness already guards creation, so the
  gate applies only to writes on *existing* forms — which also let `usePresence`
  key on `loadedFromId` alone (zero typing churn).
- **Heartbeat is visibility-gated.** `sync` skips when `document.hidden`, so an
  editor who switches tabs lets the TTL lapse rather than holding the lock from
  a background tab; returning to the tab re-claims immediately.
- **Test isolation over churn.** The existing forms specs (config, uniqueness,
  rekey) mock `holdsFreshClaim → true` and inject a default `userLogin` in their
  `mockReq` helper, so unrelated assertions don't carry presence noise; presence
  has its own dedicated specs.

## What review caught (and we fixed)

- **Re-key was ungated.** `rekeyFormHandler` moves an existing form old→new id —
  a write — but had no presence check; the plan never mentioned it. This was the
  ADR-0042 principle in action: gated it on the old id and threaded `userLogin`
  through `rekeyRecipe`.
- **`held:false` / `holder:null` race.** If the holder's claim lapsed between the
  filtered upsert and the follow-up holder read, the client locked read-only
  with no banner for up to one 30s cycle. The claim handler now retries the
  upsert once when the follow-up finds no fresh holder, taking it over
  immediately.

## Verification

- `nx run-many -t build --exclude=landing,cms` green; `tsc -b` clean.
- `form-builder-api:test` 152 passed (+5 DB-integration when run with the app
  `.env`); `form-builder-app` 490 passed; migration smoke green under `api:test`.
- **Not yet exercised:** the true two-browser flow (two GitHub users on one
  form; confirm the second is read-only and auto-unlocks after the first idles
  15 min) — the plan's manual step, left for a real browser per Isaiah's
  preference rather than a faked session.

## Open questions

- The first claim fires from a `useEffect` (client-only), so there's a brief
  window after opening an existing form where a save could 409 before the claim
  lands; the modals surface the 409 gracefully and the user retries. Accepted.
- `getPresence` is currently unused by the hook (kept as the GET-route client).
