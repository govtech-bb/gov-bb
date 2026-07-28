# Database ERD

The database is defined **once** in `@govtech-bb/database`
(`packages/database/src/entities`) and shared by both backends:

- **`apps/api`** (NestJS, TypeORM) — `AppDataSource = createDataSourceFromEnv()`;
  its `src/database/entities/*` are re-export shims over the shared package.
- **`apps/form_builder_api`** (Express, TypeORM) — `getDataSource()` calls the
  same `createDataSourceFromEnv()`.

There is one physical PostgreSQL schema. Migrations live in
`packages/database/src/migrations`.

## Relationships at a glance

Only **one** relationship is a DB-enforced foreign key. Everything else is a
**logical join by value** — the columns hold the key of another row but no
`FOREIGN KEY` constraint is declared (TypeORM entities use plain `@Column`s, not
relations).

| Relationship | Enforced? | Key |
| --- | --- | --- |
| `form_config` → `mda_contact` | ✅ FK, `ON DELETE SET NULL` | `mda_contact_id` → `mda_contact.id` |
| `payments` → `form_submissions` | logical (unique) | `submission_id` |
| `payment_transactions` → `payments` | logical | `payment_id` |
| `notification_log` → `form_submissions` | logical | `submission_id` (stored as varchar) |
| `service_status_audit_log` → `service_status` | logical | `slug` |
| many tables → *a form* | logical | `form_id` (varchar, the recipe id) |

`form_id` is a free-standing string key (the recipe id), not a UUID FK into
`form_definitions`. `form_definitions` is shown below as the logical hub because
it is the canonical row *for* a `form_id`, but a submission/draft can resolve the
committed canonical recipe without a matching DB row.

## Diagram

Solid lines (`──`) are DB-enforced foreign keys. Dashed lines (`- -`) are
logical value joins.

```mermaid
erDiagram
    form_definitions {
        uuid id PK
        varchar form_id UK "unique"
        varchar version "nullable (retired, #1196)"
        jsonb schema "ServiceContractRecipe"
        timestamp published_at
        timestamp created_at
        timestamp updated_at
    }

    form_components {
        uuid id PK
        varchar key "UK(key,version)"
        varchar version "UK(key,version)"
        jsonb schema
        timestamp created_at
        timestamp updated_at
    }

    custom_components {
        uuid id PK
        varchar namespace
        varchar type
        jsonb definition
        timestamp created_at
        timestamp updated_at
    }

    form_submissions {
        uuid id PK
        varchar idempotency_key UK
        varchar reference_code UK
        varchar form_id
        varchar form_version "nullable"
        enum status "draft|submitted|pending_payment|processing|complete|error"
        jsonb values
        jsonb meta
        timestamp submitted_at
        jsonb processors_failed "nullable int[]"
        timestamp created_at
        timestamp updated_at
    }

    form_drafts {
        uuid id PK
        varchar draft_id UK
        varchar form_id
        varchar form_version "nullable"
        jsonb values
        int last_active_page
        enum status "active|abandoned"
        timestamp last_active_at
        timestamp created_at
        timestamp updated_at
    }

    form_config {
        uuid id PK
        varchar form_id UK
        uuid mda_contact_id FK "nullable, ON DELETE SET NULL"
        jsonb config "reserved (#716)"
        timestamp created_at
        timestamp updated_at
    }

    mda_contact {
        uuid id PK
        varchar label
        varchar title "public"
        varchar telephone "public"
        varchar email "public, copied into recipe"
        jsonb address "public, nullable"
        varchar mda_email "private notification recipient"
        timestamp created_at
        timestamp updated_at
    }

    payments {
        uuid id PK
        uuid reference_number UK
        uuid submission_id UK
        varchar form_id
        enum provider "ezpay"
        varchar department
        varchar payment_code
        decimal expected_amount
        varchar description
        varchar provider_token "nullable"
        text provider_url "nullable"
        enum status "pending|initiated|success|failed|cancelled|mismatched|refunded"
        timestamp created_at
        timestamp updated_at
    }

    payment_transactions {
        uuid id PK
        uuid payment_id "indexed"
        varchar transaction_number UK
        varchar processor "nullable"
        enum status "initiated|success|failed"
        decimal amount
        timestamp date_settled "nullable"
        jsonb raw_response "nullable"
        timestamp created_at
        timestamp updated_at
    }

    notification_log {
        uuid id PK
        varchar submission_id "form_submissions.id"
        varchar form_id
        varchar reference_code "nullable"
        varchar recipient_kind "literal|contact|config|submitted"
        varchar recipient "nullable"
        enum outcome "sent|failed|defaulted|no_recipient"
        text error "nullable"
        varchar provider_message_id "SES MessageId, nullable"
        enum delivery_status "delivered|bounced|complained|rejected (nullable)"
        timestamp created_at
        timestamp updated_at
    }

    form_disabled_overrides {
        varchar form_id PK
        text reason
        varchar disabled_by
        timestamp disabled_at
    }

    form_editing_session {
        uuid id PK
        varchar form_id UK
        varchar user_login "GitHub login"
        timestamp claimed_at
        timestamp last_activity_at "15-min freshness TTL"
    }

    service_status {
        uuid id PK
        varchar slug UK
        enum status "enabled|form_disabled|disabled"
    }

    service_status_audit_log {
        uuid id PK
        varchar slug "indexed"
        enum old_state "nullable"
        enum new_state
        varchar author
        timestamp changed_at
    }

    %% Enforced foreign key
    mda_contact ||--o{ form_config : "mda_contact_id (SET NULL)"

    %% Logical value joins
    form_submissions ||..o| payments : "submission_id"
    payments ||..o{ payment_transactions : "payment_id"
    form_submissions ||..o{ notification_log : "submission_id"
    service_status ||..o{ service_status_audit_log : "slug"

    form_definitions ||..o{ form_submissions : "form_id"
    form_definitions ||..o{ form_drafts : "form_id"
    form_definitions ||..o| form_config : "form_id"
    form_definitions ||..o| form_disabled_overrides : "form_id"
    form_definitions ||..o| form_editing_session : "form_id"
    form_definitions ||..o{ payments : "form_id"
    form_definitions ||..o{ notification_log : "form_id"
```

## Table groups

- **Forms / builder** — `form_definitions` (canonical recipe rows),
  `form_components`, `custom_components`, `form_editing_session` (single-editor
  claim), `form_disabled_overrides`.
- **Runtime submissions** — `form_submissions`, `form_drafts`,
  `notification_log`.
- **Payments** — `payments`, `payment_transactions`.
- **MDA config** — `mda_contact`, `form_config`.
- **Service status** — `service_status`, `service_status_audit_log`.

All UUID-keyed tables extend `TimestampedEntity` (`id`, `created_at`,
`updated_at`); `service_status`, `service_status_audit_log`, and
`form_editing_session` extend `UuidEntity` (`id` only). `form_disabled_overrides`
is the one table with no surrogate `id` — its PK is `form_id`.
