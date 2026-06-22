# Single-sourced the MdaContact domain type into `@govtech-bb/form-types`

## Context

PR2 of the three-PR consolidation (issue [#1397](https://github.com/govtech-bb/gov-bb/issues/1397) / DUP-04, plan
`docs/plans/1395-dup-form-types-contract-consolidation.md`; PR1 was the semver
comparator #1395, PR3 is the wire types #1399). The MDA contact directory
concept (issue #607) had its shape redefined in four places:

1. the canonical TypeORM entity + `MdaContactAddress` interface in
   `@govtech-bb/database`,
2. local `MdaContact`/`MdaContactAddress`/`CreateMdaContactInput` interfaces in
   `apps/form_builder/app/types/index.ts`,
3. the Zod `createMdaContactSchema` + `addressSchema` in
   `apps/form_builder_api/src/routes/mda-contacts.ts`, and
4. the address subset inside form-types' `contactDetailsSchema`.

No consumer imported a shared type — a field added or made optional in one copy
would silently diverge.

Worked in worktree `worktree-dup-04-mda-contact-type` (branch targets `sandbox`).

## What we did

- **New canonical source** `packages/form-types/src/mda-contact.type.ts` —
  `MdaContact`, `MdaContactAddress`, `CreateMdaContactInput` (the **required**-field
  directory-entry shapes, copied verbatim from form_builder's former locals,
  which already matched the entity). Exported from `index.ts`.
- **`apps/form_builder/app/types/index.ts`** — the local interface block
  replaced with a re-export from form-types. All ~6 consumers
  (`-contact-details-editor`, `-use-mda-contacts`, `index.tsx`,
  `server/mda-contacts.ts`, and specs) keep their existing `../types/index`
  import path untouched.
- **`apps/form_builder_api/src/routes/mda-contacts.ts`** — the Zod schemas are
  now bound to the shared interface via `satisfies z.ZodType<CreateMdaContactInput>`
  / `satisfies z.ZodType<MdaContactAddress>`. No runtime change.
- **`packages/database/src/entities/mda-contact.entity.ts`** — dropped its local
  `MdaContactAddress` interface (the 4th copy), now imports it from form-types
  and re-exports it so `@govtech-bb/database`'s public `MdaContactAddress` export
  (and `apps/api`'s re-export of it) keeps resolving. The TypeORM entity *class*
  stays as the DB model.

## Why it looks this way

- **`MdaContact` and `contactDetails` are kept separate, deliberately.** The
  directory entry is authored once with its fields **required** (DB `NOT NULL`,
  consistent across entity/builder/api); `contactDetails` is the recipe subset
  and is **all-optional** with a `telephoneNumber` name, because a recipe may
  copy only a partial public subset (e.g. an email-only MDA). They are distinct
  concepts — unifying them would have meant loosening the DB-backed contract's
  nullability. We single-sourced each separately rather than merging.
- **form-types is the home, not database.** `@govtech-bb/database` already
  depends on `@govtech-bb/form-types`, so the canonical types must live in
  form-types (defining them in database and importing back would be circular).
  This also lets the form_builder *frontend* import the type without pulling
  TypeORM into its bundle.
- **Re-export shims keep the blast radius minimal.** Re-exporting from
  `form_builder/app/types/index.ts` and from the database entity means no
  consumer import path changed — the only edited call site is the form_builder_api
  schema binding.
- **The `satisfies` guard is a compile-time contract test, scoped to the drift
  that matters.** Verified by injecting a required field into
  `CreateMdaContactInput` → form_builder_api failed with
  `TS1360: Property 'driftProbe' is missing`. It catches a field **removed,
  renamed, or retyped** on the shared type, or a required field the schema stops
  producing. It does *not* catch an *extra* field added only to the Zod schema
  (`satisfies z.ZodType<T>` doesn't flag excess) — the code comments were
  corrected to state this precisely rather than overclaim.
- **No new unit tests.** DUP-04's contract is compile-time; the gate is `tsc -b`
  + the `satisfies` binding + the existing form_builder / form_builder_api specs
  staying green.

## Verification

- Tests green: `form-types`, `database`, `form-builder-app`, `form-builder-api`,
  `api`.
- `pnpm exec nx run-many -t build --exclude=landing,cms` — 14 projects build.
- `pnpm exec tsc -b` — exit 0.
- Drift guard proven (see above), then reverted.

PR3 (#1399, submission/response wire types) follows.
