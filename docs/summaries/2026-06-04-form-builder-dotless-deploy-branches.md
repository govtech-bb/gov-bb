# Form builder: dot-free Deploy/Erase branch names (#805)

## Context

Branch names in this repo must not contain a `.` — Amplify's preview-domain
cert is a single-label wildcard, so a dotted branch yields a preview URL whose
HTTPS fails (`ERR_CERT_COMMON_NAME_INVALID`), and CI's `pr-preview.yml` "Guard
branch name" step now hard-fails any `*.*` branch. The form builder's Deploy
flow predates that rule: it embedded the recipe version verbatim in the branch
name (`form-builder/<formId>-1.2.0-<ts>`), so every Deploy PR would trip the
guard. Issue #805 was filed and fixed in the same session.

## What we did

- Added `packages/form-types/src/deploy-branch.ts` exporting
  `deployBranchName(formId, version)` and `eraseBranchName(formId)`, both
  dash-sanitizing dots out of the user-influenced segments (`1.2.0` → `1-2-0`).
- Both publish implementations — `apps/form_builder/app/server/publish.ts`
  (publish + erase flows) and `apps/form_builder_api/src/routes/publish.ts` —
  now call the shared builders instead of inlining the template string.
- The committed artifacts deliberately keep the real dotted version: recipe
  file path (`<formId>/1.2.0.json`), commit message, and PR title. Only the
  branch name is sanitized.
- Tests (TDD, watched fail first): `deploy-branch.spec.ts` unit-tests both
  builders (frozen `Date.now`, including a dotted-formId case); the
  form_builder publish spec gained a test pinning the dot-free branch
  alongside the dotted artifacts, and its five existing branch-shape
  assertions were updated.

## Why we did it that way

- **Sanitize, don't reject.** Versions legitimately contain dots (semver from
  the version helper) — the branch is the only place they're illegal, so the
  fix maps `.` → `-` at the branch-name boundary rather than constraining the
  version format.
- **`formId` sanitized too, defensively.** Form IDs should never contain dots
  (kebab-id enforcement), but the branch builder is the wrong place to trust
  that — confirmed with the user before adding it.
- **Shared home in `@govtech-bb/form-types`, not per-app copies.** The first
  pass duplicated a `dotless()` helper in each app (they're separate
  deployables with no shared module between them). Code review flagged the
  silent-drift risk; both apps already runtime-import `form-types`
  (`workspace:*` dep + tsconfig path mapping in place), so centralizing there
  cost zero monorepo wiring (no new `project.json`/`references` — the
  CLAUDE.md TS6059/TS6307 gotcha doesn't apply).
- **Coverage gotcha:** `form-types` enforces a 98% function-coverage
  threshold, and re-exports in `index.ts` count as functions — the new exports
  had to be exercised *via the index* in `index.spec.ts` (the file's stated
  purpose), or the suite fails despite `deploy-branch.ts` itself being at
  100%.

## Decisions

- Reviewer noted other git-ref-illegal characters (`~`, `^`, space) remain
  unsanitized — accepted as out of scope; versions come from the semver
  helper, so `.` is the realistic offender. A hardening follow-up (git-ref-safe
  slug) is possible if ever needed.
- No route-level test for the API's dotted-version preservation in PR
  title/file path — declined; the route reads `typedRecipe.version` directly
  and the assertion would cost a full GitHub fetch-chain mock.

## Verification

- `nx run-many -t test -p form-types,form-builder-app,form-builder-api` —
  green (341 + 446 + 113 tests).
- `nx run-many -t build --exclude=landing,cms` — 13 projects green.
- `tsc -b` (CI's Type Check, covers spec files) — clean.
- `apps/forms/src/routeTree.gen.ts` regenerates on every build — reverted
  before commit (recurring gotcha).
