# gov.bb CMS

Payload 3 CMS for alpha.gov.bb content — services, organisations, and the
taxonomy that groups them. The admin lives here; the public site is
`apps/landing`.

## Publishing: what authors need to know

**Publish in the admin ≠ live on the site.** This CMS does not push directly
to alpha.gov.bb. The flow is:

1. You publish in the admin. Your change is saved in the database immediately.
2. An engineer runs `pnpm export:content` from `apps/cms`. This writes a JSON
   file per published doc into `apps/landing/src/content`.
3. The engineer commits the JSON changes and the landing site rebuilds from
   that commit.

In practice that means published changes are usually live **the same working
day**, not within minutes. If a change is urgent, ping an engineer to run the
export.

This is intentional for now — it keeps the live site auditable in git. A
direct, automatic publish path is a planned follow-up.

## Local development

```bash
pnpm install
pnpm dev          # admin at http://localhost:3000/admin
pnpm seed         # one-time: import landing markdown into Payload
pnpm export:content   # write published Payload docs back to apps/landing/src/content
```

The database is Postgres. Connection string in `.env` (`DATABASE_URI`).

### Migrations

This branch introduces the first Payload migration. `src/migrations/20260528_090649.ts`
is a **genesis migration**: it assumes an empty Postgres schema and creates
every CMS table from scratch.

If you already have a Payload database (provisioned via `pnpm dev` without
migrations, or against an earlier branch), the `IF NOT EXISTS` guards in this
migration will silently skip table creation and leave stale columns behind.
The clean recovery is to drop the schema and re-run, or generate a fresh
delta migration against the existing DB:

```bash
pnpm payload migrate:create   # writes a delta migration matching current models
```

## Collections

- **Services** — service pages (apply, register, get-a-certificate, etc.)
- **Organisations** — ministries, departments, state bodies
- **Categories / Subcategories** — taxonomy that groups services
- **Media** — uploads (hero images and other imagery used across pages)
- **Users** — admin panel access (roles: `admin`, `editor`)

## Body content

Both Services and Organisations use a Lexical rich-text editor for `body`.
Authors can insert four embeddable blocks from the toolbar:

- **Callout** — information / warning box
- **Show / hide** — collapsible section
- **Start now button** — primary CTA, links to a form / page / URL
- **Link button** — secondary CTA

Tables are supported natively in the editor — use them for things like a
role-to-phone directory or a small reference table.

## See also

- `.claude/skills/payload/SKILL.md` — Payload reference for AI assistants
- `../../CLAUDE.md` — monorepo build/test conventions
