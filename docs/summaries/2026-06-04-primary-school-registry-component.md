# Add PrimarySchool select to the builtin registry

**Date:** 2026-06-04
**Branch:** `worktree-primary-school-registry`

## What changed

A new builtin registry component, `components/primary-school`
(`packages/registry/src/components/primary-school.ts`): a select primitive
listing all 70 Barbados primary schools, registered in the components index
with the completeness guard bumped to 45. A registry spec asserts the entry
resolves with the right shape, option count, and boundary entries.

## Why it looks this way

- **`primary-school`, not `school`.** The option list is specifically primary
  schools, so the narrower fieldId leaves room for a future
  `secondary-school` component without a rename or a breaking value change.
- **Required by default, `ui.width: "long"`.** Mirrors `Parish`, the closest
  existing select; forms can override per-form. (Issue #429 tracks flipping
  the required-by-default convention for generics — this component follows
  today's convention, not that proposal.)
- **No placeholder option in the data.** The source HTML had
  `<option value="">Select a school</option>`, but the forms renderer
  (`field-renderer.tsx`) injects the empty option itself, so the component
  carries only real schools.
- **Labels/values taken verbatim** from the production select markup
  (`beneficiariesShared.school`), original order preserved. Values are the
  conventional kebab-case slugs of the labels; school names keep their
  official "St." abbreviation (unlike Parish's spelled-out "Saint"), which is
  intentional — they're official school names.

## Verification

TDD: spec extended first and watched fail. `nx run registry:test` (19 green),
`nx run-many -t build --exclude=landing`, and `pnpm exec tsc -b` all pass.
Code-reviewer pass: 0 findings (verified all 70 values unique and
convention-compliant).
