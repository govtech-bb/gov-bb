# Declare phantom dependencies (#1419, TECH-02)

## What
Added 12 packages that apps imported from source but never declared in their own
`package.json`, so they resolved only via pnpm workspace-root hoisting. Now each
app is self-describing. No behavioural change; lockfile change is additive.

- **apps/api** (deps): `@nestjs/throttler`, `class-validator`, `class-transformer`,
  `rxjs`, `json-logic-js`, `dotenv`; (devDeps) `unplugin-swc`, `@types/json-logic-js`
- **apps/forms** (devDeps): `@testing-library/jest-dom`, `@testing-library/react`,
  `@testing-library/user-event`, `jest-axe`
- **apps/form_builder** (devDeps): `@testing-library/jest-dom`, `@testing-library/react`,
  `@testing-library/user-event`
- **apps/landing** (devDep): `@tanstack/eslint-config`

## Why the pins look the way they do
The plan said "pin to the resolved version." That had to bend for three deps
because the CI gate `pnpm lint:deps` is **sherif**, which fails unless every
workspace package declares a dependency with the *identical specifier string*
(caret vs exact counts as different). So instead of the bare resolved version we
matched the specifier already used elsewhere in the workspace — resolution is
unchanged:

- `dotenv` → `17.4.2` (exact, matching chat + form_builder_api), not `^17.4.2`
- `rxjs` → `^7.0.0` (matching root), not `^7.8.2`
- `@types/json-logic-js` → `^2.0.7` (matching packages/expressions), not `^2.0.8`

`dotenv` exact also better serves the chosen intent — align api with its sibling
backend apps, which pin `17.4.2`.

## Side discovery (left out of scope)
Declaring `@tanstack/eslint-config` makes `apps/landing` eslint **runnable** for
the first time — its `eslint.config.js` imported that package, which was never
installed, so `eslint` crashed with `ERR_MODULE_NOT_FOUND`. It now runs and
reports ~15 pre-existing lint errors (13 auto-fixable) in landing source. eslint
is not a CI gate (only `lint:deps` is), so these were left untouched per the
surgical-change rule; worth a follow-up issue.

## Verification
build (16 projects, excl. landing) · api/forms/form-types tests (879 pass, 98.13%
cov) · form-builder-app test (614 pass) · `pnpm lint:deps` (sherif) clean.
