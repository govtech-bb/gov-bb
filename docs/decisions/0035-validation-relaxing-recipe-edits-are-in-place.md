# 0035 — Validation-relaxing recipe edits are in-place, no version bump

**Date:** 2026-06-04
**Status:** Accepted

## Context

Issue #761 required adding `optionalIf` behaviours to the National ID fields
of every recipe that offers a "Use passport number instead" show-hide toggle —
16 fields across 11 recipes. Each edit is a pure *relaxation*: a field that was
unconditionally required becomes optional under one condition. Nothing a
citizen (or a pinned draft) had previously entered becomes invalid.

The question was whether each touched recipe needed a new semver version file
(`1.1.0.json` → `1.2.0.json`) or whether the latest version files could be
edited in place. Recipe versions exist so that in-flight drafts pinned to a
version keep validating against the contract they were started under, and so
that breaking contract changes ship as new versions the loader serves to new
sessions only.

Publishing ~11 new version files was considered and rejected: for a pure
relaxation the version mechanism protects nothing (no previously-valid input
can be rejected), and the bumps would carry real costs — churn in every pinned
`formVersion` reference, double-entry of each recipe's content, and an
audit-trail entry that records ceremony rather than substance.

## Decision

When a recipe change only **relaxes** validation — every input that validated
before still validates after — edit the **latest version file in place**. Do
not create a new version. Older version files are never touched; the loader
keeps serving latest-by-semver.

New version files are reserved for changes that can **invalidate** existing
drafts or submissions: tightening or adding validations, removing or renaming
fields that hold data, restructuring steps, or anything else where a pinned
draft needs the old contract to stay submittable.

A field-id rename (here: a show-hide toggle's `fieldId`,
`passport-number` → `passport-toggle`) rides along with an in-place edit only
when the field stores no submitted data of its own beyond UI toggle state and
every in-recipe reference (`fieldConditionalOn`/`optionalIf` targets) is
updated in the same edit.

## Consequences

- Relaxation fixes reach all users of the latest version immediately — no
  draft is stranded on a version that blocks submission.
- The git history of the version file, not a new version number, is the audit
  trail for relaxations. `git log -p` on the recipe file shows what changed.
- Anyone diffing two checked-in copies of the same version (e.g. a deployed
  artifact vs the repo) must expect in-place drift for relaxations; the
  invariant suite (`recipe-invariants.spec.ts`), not version pinning, guards
  the contract's structural rules.
- Judging "is this a pure relaxation?" is on the author: if any existing input
  could become invalid, it is not one, and a new version is required.
