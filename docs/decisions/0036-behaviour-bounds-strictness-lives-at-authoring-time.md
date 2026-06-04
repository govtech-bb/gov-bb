# 0036 — Behaviour-bound strictness lives at authoring time, not in the parse schema

**Date:** 2026-06-04
**Status:** Accepted

## Context

Issue #771 redefined repeatable-step bounds: `min` is now a 1-based total
("instances the citizen sees up front", integer >= 1) and `max` a total cap
(integer >= `min`). The legacy value `min: 0` ("base step only") rendered
nearly identically to `min: 1` and read as "no entries at all", so it had to
disappear as an authorable value — but published recipes carrying `min: 0`,
missing bounds (conductor `1.0.0`'s bare `{ "type": "repeatable" }`), or junk
values must keep loading and rendering exactly as before.

That put three plausible homes for the new rule in tension:

- **Tighten the zod schema** (`repeatableBehaviourSchema.min: z.number().int().min(1)`)
  — rejected: the API recipe file loader parses every published version file
  with the same schema, so old versions would fail to load.
- **A zod `.transform` clamp** — rejected: it silently corrects bad values at
  the contract boundary, so authors never learn their config was wrong and the
  stored artifact no longer matches what they wrote.
- **UI-only clamping in the builder** — rejected: hand-authored and
  AI-generated recipes bypass the UI entirely, and the `max: 0` trap would
  survive in the contract.

## Decision

Structural rules for behaviour parameters are enforced in **three layers with
distinct jobs**, and new rules must follow the same split:

1. **Parse schemas stay lenient.** `repeatableBehaviourSchema` keeps
   `z.number()`. A zod schema in `form-types` answers "can this artifact be
   loaded?", never "is this artifact well-authored?". Tightening a parse
   schema is never the way to add a rule — it retroactively breaks published
   versions.
2. **`validateFormContract` is the strict gate.** Author-time saves (the
   builder's `POST /builder/registry/validate` path) reject violations loudly
   with per-field issue paths (`steps.<i>.behaviours.<j>.min`). Nothing is
   silently corrected.
3. **The runtime normalizes what it can render.** `getEffectiveRepeatBounds`
   in the forms app clamps legacy/junk values once, at the edge
   (`min >= 1`, unusable `max` → `Infinity`), so branch logic never sees a
   bad bound and legacy recipes render identically to before the rule existed.

The builder UI additionally prevents bad input ergonomically (descriptor
metadata: `defaultValue`/`minValue`/`atLeastParam`), but that is UX, not
enforcement — the gate is layer 2.

## Consequences

- Old published recipe versions never need migrating to keep working; the
  runtime owns backward compatibility, not the data.
- A recipe that changes a behaviour's *semantics* (as `min: 0` → `min: 1`
  here, in `post-office-redirection-individual` `1.3.0`) ships as a new
  version even when rendering is provably unchanged — the bump documents the
  semantics migration. This sits alongside ADR 0035: relaxations may be
  edited in place, but a version bump is always permitted and is the right
  vehicle for a semantics change.
- Future behaviour rules (e.g. the `fieldArray` bounds excluded from #771's
  scope, or follow-ups from #742) get added to `validateFormContract` plus a
  runtime normalizer — not to the zod schemas.
- The asymmetry is deliberate and must be kept: anything `validateFormContract`
  rejects can still parse, load, and render via the clamps if it already
  exists in published data.
