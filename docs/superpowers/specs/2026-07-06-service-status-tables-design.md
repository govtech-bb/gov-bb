# Service Status Tables — Design

**Date:** 2026-07-06
**Status:** Approved
**Branch:** `service-status-tables`

## Context

Form visibility is currently recipe-driven: each recipe carries `meta.visibility`
(`public` / `preview` / `draft` / `maintenance`, defined in
`packages/form-types/src/service-contract.type.ts`), enforced by
`apps/api/src/forms/form-definitions/form-definitions.service.ts` (public-list
filtering, 404 on non-public single fetches unless a preview token/cookie is
presented). A separate DB table, `form_disabled_overrides`, acts as a
kill switch that always wins.

This design introduces a **database-driven** alternative for handling service
visibility and preview state: a current-state table (`service_status`) plus an
append-only audit trail (`service_status_audit_log`). This migration lays the
schema only; consuming feature work (API enforcement, admin mutation endpoints)
comes later.

## Semantics (confirmed)

One shared Postgres enum, `service_status_enum`:

- `enabled` — service fully live: landing page visible, form reachable.
- `form_disabled` — service page stays visible, but the form itself is
  unreachable (maintenance-style).
- `disabled` — the whole service is hidden from the public; behaves like
  today's token-gated preview (viewable with the preview token/cookie).

No separate `preview` value: `disabled` covers it. Absence of a row for a
`form_id` is interpreted by the consuming app layer (expected: enabled /
fail-open) — not encoded in this schema.

## Schema

### `service_status` — one row per form, current state only

| column    | type                             | notes                                    |
| --------- | -------------------------------- | ---------------------------------------- |
| `id`      | `uuid` PK                        | `DEFAULT uuid_generate_v4()`             |
| `form_id` | `varchar(100) NOT NULL`          | unique index — one status row per form   |
| `status`  | `service_status_enum NOT NULL`   | `DEFAULT 'enabled'`                      |

No timestamps: the audit log is the record of when changes happen.

### `service_status_audit_log` — append-only change history

| column       | type                                | notes                                        |
| ------------ | ----------------------------------- | -------------------------------------------- |
| `id`         | `uuid` PK                           | `DEFAULT uuid_generate_v4()`                 |
| `form_id`    | `varchar(100) NOT NULL`             | non-unique index for per-form history        |
| `old_state`  | `service_status_enum` (nullable)    | NULL for a form's first-ever entry           |
| `new_state`  | `service_status_enum NOT NULL`      |                                              |
| `author`     | `varchar(255) NOT NULL`             | email of the user who made the change        |
| `changed_at` | `timestamp NOT NULL DEFAULT NOW()`  | when the change was made                     |

`changed_at` (not `updated_at`): rows in an append-only log are never updated;
the timestamp records when the state change happened.

No foreign keys — consistent with every other `form_id` table (there is no
forms registry to reference), and audit rows must survive independently of the
status row.

## Deliverables

1. `packages/database/src/migrations/{timestamp}-CreateServiceStatusTables.ts`
   — `up`: create enum type, both tables, indexes; `down`: drop tables, then
   type. Registered in `migrations/index.ts` and `src/index.ts` (migrations
   array).
2. Entities `service-status.entity.ts` (extends `UuidEntity`) and
   `service-status-audit-log.entity.ts`, registered in `entities/index.ts` and
   `src/index.ts` (entities array).
3. Smoke spec
   `apps/api/src/database/migrations/create-service-status-tables.smoke.spec.ts`
   following the always-rolled-back-transaction pattern
   (see `create-form-editing-sessions.smoke.spec.ts`): asserts column shapes,
   enum values, unique-index rejection on `service_status.form_id`, nullable
   `old_state`, and clean `down()`.

## Verification

- `pnpm exec nx run api:test` (smoke spec runs when `DB_HOST` is set)
- `pnpm exec nx run database:test`
- `pnpm exec nx run-many -t build --exclude=landing`
- `tsc -b` on touched projects (no new errors vs baseline)
