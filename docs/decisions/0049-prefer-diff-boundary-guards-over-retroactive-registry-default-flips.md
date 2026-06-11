# 0049 — Prefer diff-boundary guards over retroactive registry-default flips

**Date:** 2026-06-11
**Status:** Accepted

## Context

Registry primitive defaults are **global and unversioned**. The 10
`components/generic-*` primitives in `packages/registry` each ship
`validations.required = { value: true, error: "This field is required" }`, and
recipe overrides merge per-key against those defaults (ADR 0037) in both
resolvers (`apps/api/src/registry/resolution.ts`,
`packages/form-builder/src/resolution.ts`). An override that omits
`validations.required` therefore silently inherits `required: true` and renders
the generic error on an empty, optional-looking field. Across the corpus a few
hundred generic field instances are implicitly required this way — many
unintentionally (#429).

The obvious "fix" is to flip the base default to `required: false`. But the base
primitive default is shared by **every recipe version that references it** —
there is no per-version pinning of registry defaults. Flipping it would:

- change the **served behaviour of every existing recipe version at once**,
  silently making genuinely-required fields optional; and
- to re-assert `required: true` on those recipes, force a new version file for
  each — recipe versions are immutable (ADR 0041), so corrections can't be made
  in place.

That is a broad, migration-heavy behaviour change masquerading as a default
tweak.

## Decision

When a registry primitive's default is judged wrong, **do not flip the default
to fix existing usage.** Instead:

1. **Leave the served behaviour untouched.** No registry edit, no resolution
   change — existing recipe versions keep resolving exactly as before.
2. **Enforce the correct choice at the PR diff boundary** with a CI guard that
   is *diff-scoped* and *per-changed-entity*: only the fields a PR **adds or
   modifies** are in scope; untouched usage is **grandfathered**. This keeps the
   forcing function additive — authors are never made to retro-fit fields they
   didn't touch.
3. **Provide a label escape hatch** for deliberate exceptions, mirroring the
   sibling recipe gate (`recipe-version-override` → `recipe-required-override`),
   read live from the API so "add the label and re-run" works without a new
   commit.
4. **Treat corpus migration as a separate, explicit decision** — never a side
   effect of a default change. Backfilling explicit values across existing
   recipes is its own ticket, made on purpose, not forced by flipping a shared
   default.

Today's instance: #429 ships `scripts/recipe-required-guard.ts`, a
`pull_request`-only guard requiring explicit `validations.required.value`
(`true` or `false`) on every `components/generic-*` field a PR adds or modifies.
It mirrors the `recipe-version-guard.ts` shape — a pure, unit-tested decision
function plus a thin CI driver. No registry default was changed.

## Consequences

- The unsafe-by-default behaviour stops spreading without disturbing a single
  served form — the change is purely a forcing function on new authoring, so it
  can ship without an audit of the existing corpus.
- The choice becomes deliberate going forward: a generic field that blocks
  submission now says so explicitly in the recipe, rather than inheriting it
  invisibly.
- This is the default playbook for "a shared primitive default is wrong":
  guard the diff, grandfather the past, migrate on purpose. It complements
  ADR 0036 (strictness lives at authoring time) and ADR 0037 (per-key merge):
  given that overrides merge per-key and the base ships `required: true`, the
  only place to make intent explicit *without* a global flip is the authoring
  boundary.
- The corpus's existing implicitly-required fields remain a known, separately
  trackable cleanup — visible and intentional, not silently flipped.
- Out of scope by the same reasoning, as follow-ups: `blocks/*`-nested generic
  primitives, non-generic primitives that also default to required (`name`,
  `email`, `address`, …), and any change to runtime resolution / registry
  defaults.
