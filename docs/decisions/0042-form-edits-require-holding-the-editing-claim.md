# 0042 — Editing an existing form requires holding its fresh editing claim

**Date:** 2026-06-08
**Status:** Accepted

## Context

Issue [#874](https://github.com/govtech-bb/gov-bb/issues/874), a follow-up to
[#873](https://github.com/govtech-bb/gov-bb/issues/873) (ADR 0041). The deploy
guards in 0041 stop two deploys colliding on a *version*, but not the root
cause: two people editing the same form at once, each unaware of the other.
The loser still discovers the conflict at deploy time, after wasting the work.

The issue proposed an *advisory* banner only, with hard locks listed as a
non-goal. We consciously overrode that: an advisory second session would still
need concurrent field-state syncing to be useful, which is the real cost. A
read-only second session sidesteps that entirely and is a stronger guarantee.

## Decision

A form in the builder has **one editing claim** — a `form_editing_session` row,
unique on `form_id`, holding `user_login` + `last_activity_at`. A claim is
*fresh* while `last_activity_at > now() - 15 minutes`; past that it is stale,
ignored on read, and overwritable.

1. **Every server-side write to an _existing_ form requires holding the fresh
   claim.** Save, new-version save, re-key, and the deploy reservation all call
   `holdsFreshClaim(formId, userLogin)` and return **409** (`code:
   "presence_conflict"`) when the caller isn't the holder. This is the
   authority — the UI's read-only gating is convenience, not enforcement. Any
   *future* write endpoint on an existing form must be gated the same way (the
   re-key path was caught by review precisely because it wasn't).

2. **Identity is server-stamped, never client-supplied.** `form_builder_api`
   has only the shared admin token and no user concept, so the TanStack server
   fns stamp `userLogin` from `session.login`. The API hard-rejects any
   presence / save / deploy write with an empty `userLogin` (400),
   defense-in-depth.

3. **Brand-new form creation (`isNew`) is exempt.** A never-saved form has no
   prior editor and isn't in anyone else's picker; `formId` uniqueness already
   guards concurrent creation. Gating it would only 409 the first save and
   churn claims on half-typed ids.

4. **Claiming is a single atomic conditional upsert; the TTL is the
   guarantee.** `PUT …/presence` inserts-if-absent, else updates only if the
   row is *mine* (heartbeat) or *stale* (takeover) — never a blind upsert that
   steals a live holder's claim. Handover is auto-claim in place: a viewer
   whose poll finds the claim free takes it over and unlocks. Eager release on
   leave is best-effort; the 15-minute inactivity TTL is the real backstop.

## Consequences

- New mutating endpoints on an existing form (anything beyond create) must
  thread `userLogin` from the session and call `holdsFreshClaim`. Forgetting to
  is an authorization hole, not just a missing nicety.
- `holdsFreshClaim` and the `FRESH` predicate (`> now() - 15 min`) are the
  single shared definition of "the holder", reused by the presence routes and
  the write enforcement; the takeover `WHERE` (`<= now() - 15 min`) is its exact
  complement, so there is no boundary gap.
- Read-only is enforced server-side; the client's `usePresence` hook
  (claim-on-load, 30s re-sync that doubles as heartbeat + poll + takeover,
  best-effort release) and the disabled affordances are UX, and must never be
  relied on as the security boundary.
- Presence rows are transient, single-row-per-form state. Tooling that
  reconciles the DB must treat a stale or missing row as "no holder", and must
  not resurrect a row it didn't claim.
