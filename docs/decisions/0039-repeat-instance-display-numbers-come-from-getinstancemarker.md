# 0039 — Repeat-instance display numbers come from getInstanceMarker

## Status

Accepted (2026-06-04)

## Context

Repeat-step instances are materialised with `~N` stepId suffixes, but the
suffix is **not** the user-facing instance number — the mapping depends on
layout:

- **Without sharedFields** the base step *is* instance 1, so `~N` is
  instance N + 1.
- **With sharedFields** the base step is a separate shared-values page and
  instances are `~1..~min`, so `~N` *is* instance N (and `~1` is the first
  instance, never marked).

The #801 plan assumed `~N` → N + 1 universally; implementing that would have
misnumbered every sharedFields recipe. `getInstanceMarker` in
`apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts` encapsulates
the layout-aware mapping plus the marker rules (instance 1 never marked;
configured `instanceLabel` versus auto-number fallback).

## Decision

Any surface that displays repeat-instance identity — step titles, review
headings, and future surfaces such as submission summaries, recipient emails,
or PDFs — derives it via `getInstanceMarker` (or a helper built on it). No
code computes a display number from the `~N` suffix directly.

## Consequences

- The suffix-vs-position trap is fixed in one place; sharedFields recipes
  number correctly everywhere the helper is used.
- New marker surfaces inherit the "instance 1 is never marked" and
  label-vs-fallback rules for free, keeping surfaces consistent.
- Changes to instance numbering semantics happen in `getInstanceMarker` and
  its spec, not scattered across renderers.
