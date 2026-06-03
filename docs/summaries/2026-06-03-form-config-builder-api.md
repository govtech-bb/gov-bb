# Form-builder API persistence for mda_contact + form_config (#607)

Date: 2026-06-03
Issue: [#607](https://github.com/govtech-bb/gov-bb/issues/607)
Branch: `worktree-form-config-builder-api-607` → `feat-607-per-env-email-recipients` (integration) → `sandbox`
Plan: [docs/plans/607-form-config-mda-contact-recipients.md](../plans/607-form-config-mda-contact-recipients.md)

**Session 3 of 4.** Sessions 1+2 added the DB tables and the API-side resolution
of the `config.mdaEmail` recipient. This session lets the form builder *author*
the data those rely on: an MDA contact directory and the per-form contact link.
Built **in parallel with Session 4** (the builder UI) against a contract locked
up front — the two touch disjoint trees (`form_builder_api` vs
`form_builder`/`form-types`).

## Why this work happened

`config.mdaEmail` resolves to `form_config → mda_contact.mda_email`, but nothing
yet writes those rows. Per the plan, the form builder writes them **directly to
the production DB** on save (independent of the publish PR). This session adds
the `form_builder_api` endpoints; Session 4 wires the UI to them.

## The API contract (locked before building, so the UI could be built in parallel)

- `GET /builder/mda-contacts` → `MdaContact[]` (incl. the private `mdaEmail` — the
  builder is the authenticated admin tool that authors it, behind the
  `x-admin-token` middleware; it never reaches the public forms API).
- `POST /builder/mda-contacts` → `{ label, title, telephone, email, address?, mdaEmail }` → `201` full record.
- `POST /builder/forms` & `PUT /builder/forms/:formId` accept an **optional sibling**
  `mdaContactId` alongside `recipe` (never inside it — `mdaContactId`/`mdaEmail`
  are DB-only and must not enter the committed recipe).
- `GET /builder/forms/:formId/config` → `{ mdaContactId: string | null }`.

## Decisions worth the reasoning

**The `form_config` upsert rides inside the recipe-save transaction.** Both create
(`repo.save`) and update (raw `UPDATE`) were wrapped in `ds.transaction(...)` so
the recipe write and the contact link commit atomically — a failed config upsert
can't leave an orphaned recipe row, and vice versa. The conflict target is
`form_config.form_id` (the Session-1 unique index).

**`mdaContactId` parsing is tolerant, not strict.** Absent from the body → the
config row is left untouched (so a save that doesn't carry the field never nulls
an existing link); an explicit `null` clears it (FK is `ON DELETE SET NULL`); a
string sets it. A malformed value is ignored rather than 400-ing the whole
recipe save — the builder owns this field and only ever sends a real id or null,
so a bad value shouldn't block a valid recipe.

**`GET /:formId/config` is a separate endpoint, not folded into the recipe GET.**
Keeps the existing recipe-load response (`ServiceContractRecipe`) unchanged; the
builder fetches config alongside the recipe on open.

## Deviations / notes

- **`rekey` does not carry `mdaContactId`.** The contract only specifies it on
  `POST /builder/forms` and `PUT /builder/forms/:formId`; a re-key moves rows
  server-side and the `formId`-keyed config follows. Revisit if re-key ever needs
  to move the link explicitly.
- Contact **edit (PUT)** is deferred — the plan only needs list + create.

## Verification

- `nx run form-builder-api:build` — clean.
- `nx run form-builder-api:test` — 14 suites, 93 tests pass (list, create
  valid/invalid, config upsert on create AND update asserted *inside the
  transaction*, `GET …/config` present/null).
- Spec note: this app's `tsconfig` excludes `*.spec.ts` (specs type-checked by
  ts-jest), so there's no `tsc -b` spec gate here; production `src` compiles
  under the strict build.
