# DB schema for per-environment email recipients: `form_config` + `mda_contact` (#607)

Date: 2026-06-03
Issue: [#607](https://github.com/govtech-bb/gov-bb/issues/607)
Branch: `worktree-form-config-mda-contact-db-607` → `sandbox`
Plan: [docs/plans/607-form-config-mda-contact-recipients.md](../plans/607-form-config-mda-contact-recipients.md)

This is **Session 1 of 4** — the database layer only. Sessions 2–4 (API
resolution + recipe migration, form-builder API persistence, form-builder UI)
build on this schema.

## Why this work happened

#607 (a `security` + `enhancement` issue): form recipes hardcode the email
recipient (`recipientField`) in committed JSON, so (a) sensitive production MDA
addresses live in source control, and (b) sandbox and production resolve to the
same recipient — a test submission can email a real MDA, or a test address can
ship to production.

The plan's fix moves the production recipient into a per-environment DB: a
recipe carries a stable token, and the runtime resolves the real address at
send time. Sandbox has no row and falls back to a default test inbox. Session 1
lays the two tables that make this possible.

## What the schema captures

- **`mda_contact`** — a reusable directory of department contacts an author can
  pick from in the builder. Its **public** subset (`title`, `telephone`,
  `email`, `address`) maps to the existing `contactDetails` shape and is what
  gets copied into the published recipe. `mda_email` is the **private**
  notification recipient — DB-only, and by design never enters the service
  contract sent to the client.
- **`form_config`** — per-form, per-environment config. One row per form
  (unique `form_id`). Production gets a row; sandbox doesn't, which is how the
  same form resolves differently per environment.

## Decisions worth the reasoning

**`mda_contact_id` is a real FK column, not JSONB.** The plan originally modelled
the reference as `config.mdaContactId` inside a JSONB blob (no enforceable FK).
We promoted it to a real `form_config.mda_contact_id uuid` column with a
DB-level FK to `mda_contact(id)` **`ON DELETE SET NULL`**. The `SET NULL` rule
is load-bearing: the plan requires that a deleted/missing contact falls back to
the default inbox rather than throwing into a stale production address — so the
config row must survive a contact deletion with its reference nulled, not
cascade-deleted. `config` (JSONB, nullable) is kept but unused, reserved for the
payment-processor override deferred to #716.

**One migration creates both tables**, `mda_contact` first (FK ordering), with
`down()` dropping in reverse — matching the `CreatePaymentTables` precedent,
rather than the plan's "two migrations" which would have needed the same
ordering care anyway.

## The duplication trap (drift from the plan)

The plan said Session 1 touches **only `packages/database`**. Orientation
showed that's insufficient: this repo **duplicates** TypeORM entities and
migrations across two locations.

- `apps/api/src/database/` — what the **NestJS runtime and the `migration:run`
  CLI actually use** (`AppDataSource`, glob-loaded). Its entities carry
  `@nestjs/swagger` `@ApiProperty` decorators.
- `packages/database/src/` — the clean shared copy (`@govtech-bb/database`)
  consumed by `apps/form_builder_api` (Session 3 writes through it via
  `createDataSource`) and scripts; registered via explicit `entities` /
  `migrations` arrays.

The two dirs already held byte-identical files but had **drifted** (each had
migrations the other lacked). A migration added only to `packages/database`
would have **silently never run** against the DB the API uses. So Session 1
adds to **both** locations. This duplication — and the footgun it creates — was
filed as its own issue, **[#721](https://github.com/govtech-bb/gov-bb/issues/721)**
(dedupe entities & migrations), to fix later rather than expand this PR.

A swagger-typing snag surfaced while mirroring the entities: in
`@nestjs/swagger` v11, `@ApiProperty({ type: "object", ... })` only type-checks
when `required`/`nullable` are absent from the same literal (the extra keys
shift the overload). The api-side jsonb fields follow the proven
`form-draft.entity.ts` shape accordingly.

## What changed

- `apps/api/src/database/entities/{mda-contact,form-config}.entity.ts` (with
  `@ApiProperty`) + barrel.
- `packages/database/src/entities/{mda-contact,form-config}.entity.ts` (clean) +
  barrel + registration in the `entities` array in `packages/database/src/index.ts`.
- `…-CreateMdaContactAndFormConfig.ts` migration in **both** migration dirs;
  registered in the `migrations` array in `packages/database/src/index.ts`
  (apps/api is glob-loaded, so the file + the `!(*.spec)` glob suffice).
- `create-mda-contact-and-form-config.smoke.spec.ts` — migration smoke test
  following the existing `create-form-disabled-overrides.smoke.spec.ts` pattern
  (runs `up()`/`down()` inside a transaction it always rolls back, so the live
  local DB is never mutated).

## Verification

- `nx build` for `database` + `api`, and `tsc -b` (api + database) — clean.
- DDL validated on a scratch DB via `psql`: column types/nullability, the unique
  `form_id` index (duplicate insert rejected), and the FK `ON DELETE SET NULL`
  behaviour (deleting a contact nulled the reference).
- Full migration chain run end-to-end via the real TypeORM CLI
  (`pnpm run migration:run`) on a fresh DB — the new migration applied last —
  then `migration:revert` dropped both tables cleanly.
- Smoke spec passes in isolation; the full `api` suite stayed green (708/708).
