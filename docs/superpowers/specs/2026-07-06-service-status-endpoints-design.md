# Service Status Endpoints — Design

**Date:** 2026-07-06
**Status:** Approved
**Branch:** `service-status-api` (based on `sandbox`; PR targets `before_trunk`)

## Context

PR #1876 landed the **schema only** for database-driven service visibility:
`service_status` (one row per `slug`, current state) and
`service_status_audit_log` (append-only history), sharing the
`service_status_enum` (`enabled` / `form_disabled` / `disabled`). The PR body
notes: *"API enforcement and admin mutation endpoints come in later work."*

This design is that follow-up: the read + admin-mutate endpoints on top of the
existing tables. No schema changes.

## Endpoints

Controller `@Controller("service_status")` — literal path per the task spec.
Throttled at the controller (matching the form-disabled-overrides admin
controller).

### `GET /service_status`

Unauthenticated read. Returns every `service_status` row mapped to the minimal
shape `{ slug, status }`.

- Response: `ApiResponse.success(items, { message: "Service statuses retrieved" })`.

### `PUT /service_status`

Admin-guarded (`@UseGuards(new AdminTokenGuard("SERVICE_STATUS_ADMIN_TOKEN",
"ARCHIVE_DRAFTS_TOKEN"))` on the method — ADR-0061 dev-bypass token pattern),
`@ApiBearerAuth()`, `@HttpCode(200)`.

Body DTO `UpdateServiceStatusDto`:

- `slug` — `@IsString @IsNotEmpty @MaxLength(100)`
- `status` — `@IsEnum(ServiceStatus)`
- `author` — `@IsString @IsNotEmpty @MaxLength(255)`

Response: `ApiResponse.success({ slug, status }, { message: "Service status
updated" })`.

**Contract note:** wire fields are camelCase (`slug`, `author`) to match the
codebase's existing admin DTOs (e.g. `DisableFormDto.disabledBy`). The `slug`
identifier follows the schema column of the same name — not every service is a
form, so the column was renamed `form_id` → `slug` (see the
RenameServiceStatusFormIdToSlug migration).

## Service logic — `ServiceStatusService.setStatus(slug, status, author)`

One `SERIALIZABLE` transaction via `ServiceStatusRepository.tx()`, with the
audit repository bound to the same transaction through `BaseRepository.withRepo()`:

1. Load the existing `service_status` row for `slug`;
   `oldState = existing?.status ?? null`.
2. If `oldState === status` → idempotent no-op: no update, no audit row (the log
   records *changes*).
3. Otherwise **upsert** the status (update the existing row, or insert a new one
   if none exists) and insert an audit row
   `{ slug, oldState, newState: status, author }`.

**Upsert, not 404:** the schema treats a form's first PUT as a create — the
audit log's `old_state` is nullable precisely "for a form's first-ever entry",
and absence of a row means the app-layer default. So the first set has no row to
update; it creates one with `oldState = null`.

## Deliverables

1. Re-export shims `apps/api/src/database/entities/service-status.entity.ts` and
   `service-status-audit-log.entity.ts` (mirroring the existing per-entity
   shims — `@govtech-bb/database` is the single source of truth).
2. `apps/api/src/services/`:
   - `service-status.repository.ts`, `service-status-audit-log.repository.ts`
     (extend `BaseRepository`)
   - `dto/update-service-status.dto.ts` (+ `dto/index.ts`)
   - `service-status.service.ts`, `service-status.controller.ts`,
     `service-status.module.ts`
3. Register `ServiceStatusModule` in `apps/api/src/app.module.ts` imports.
4. Colocated Vitest specs for the service and controller.

## Verification

- `pnpm exec nx run api:test`
- `pnpm exec nx run-many -t build --exclude=landing`
