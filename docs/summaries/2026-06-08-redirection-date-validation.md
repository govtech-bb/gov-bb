# Redirection forms validate start/end date pair (#858)

## Context

Two post-office redirection forms accepted a redirection **end date before its
start date** and a **start date in the past** —
[#858](https://github.com/govtech-bb/gov-bb/issues/858). The issue asked for a
fresh sweep of the latest version of every recipe; that re-audit found only two
genuine offenders still unfixed (the rest had been corrected by later version
bumps): `post-office-redirection-individual` (1.5.0) and
`post-office-redirection-deceased` (1.2.0). `post-office-redirection-business`
(1.2.0) already had the correct `futureOrToday` + `after` shape and served as
the reference. Resolved on `redirection-date-validation-858` (targets
`sandbox`).

## What we did

- **`post-office-redirection-individual/1.6.0.json`** (from 1.5.0): on step
  `new-address`, `new-redirection-start-date` gains `futureOrToday`;
  `new-redirection-end-date` gains `after` (referencing the start) +
  `futureOrToday`. Straight copy — the recipe already used
  `components/generic-date`.
- **`post-office-redirection-deceased/1.3.0.json`** (from 1.2.0): same two
  validations on `redirection-start-date` / `redirection-end-date`, **and** both
  fields switched from `components/date-of-birth` to `components/generic-date`.
- Filed a follow-up issue for jobstart's free-text `job-start-date` /
  `job-end-date` (can't take a cross-field rule until restructured into
  structured date fields) — deferred per the plan's scope, tracked in
  [#922](https://github.com/govtech-bb/gov-bb/issues/922).

## Why we did it that way

- **The deceased fix was bigger than "add a rule".** The plan assumed the
  deceased form mirrored business and just needed `futureOrToday`. It didn't:
  its redirection dates were built on `components/date-of-birth`, which ships a
  `past` validation. The production registry resolver **merges** a semantic
  component's baked-in validations with the recipe's overrides
  (`apps/api/src/registry/resolution.ts`, `mergeValidations`), so the served
  form already silently rejected any *future* redirection date — a latent bug.
  Adding `futureOrToday` on top of the inherited `past` would have made the
  field impossible to satisfy. Switching to `components/generic-date` removes
  the inherited `past` and is the guardrail-correct primitive for a non-birth
  date (system-prompt CATEGORY 0). This is why the deceased diff changes a `ref`
  and the individual diff does not.
- **New version files, never edit in place.** Repo convention: one immutable
  file per published version; the loader auto-resolves the highest semver as
  "latest" and enforces filename == internal `version`. Minor bump only.
- **Strict `after`, not `onOrAfter`.** Matches business 1.2.0; a zero-day
  redirection window is not a real case.

## Open questions

- None blocking. The jobstart restructure is tracked in its own follow-up issue;
  `term-leave`'s `leave-start-date` `futureOrToday` was deliberately left off
  (retroactive emergency leave may be legitimate).
