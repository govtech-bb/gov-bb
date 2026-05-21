# Unify content model — landing as single source of truth

Proposal to consolidate ministry / department / state-body data into one file per entity, so chat (and any future consumer) ingests from a single shape.

Status: **draft, awaiting approval before edits**.

---

## Why

Today each ministry / department / state-body has its data split across two files:

```
apps/landing/src/content/ministries/ministry-of-finance...md   ← prose, phone tables
apps/landing/src/content/ministries.ts (one entry)             ← minister, keywords, contacts, services
```

Consequences:

- **No single source of truth.** A minister's name lives in `.ts`; their phone numbers live in `.md`. PRs touch both or drift.
- **Every consumer pays the gluing tax.** Chat currently runs two loaders (MD walker + TS-registry regex parser) and joins them at ingest. Future consumers (admin UI, search, agents) repeat that work.
- **Hard to validate.** TS catches some errors; MD frontmatter is unvalidated. Typos like `MIIST` (since fixed) shipped to production-ready data.
- **Form linking has no obvious home.** Chat needs to know which forms attach to a service page; currently that link doesn't exist anywhere structured.

## What changes

**Each ministry / department / state-body / service becomes one MD file with full structured frontmatter.** Body holds prose; frontmatter holds typed fields validated by Zod.

```yaml
---
slug: ministry-of-industry-innovation-science-and-technology
name: "Ministry of Industry, Innovation, Science and Technology"
category: ministerial
keywords: [MIST, Industry, Innovation, Science, Technology]
shortDescription: "Digital transformation of the public service and a culture of innovation."
intro: "To drive the digital transformation of the public service and foster a culture of innovation and scientific advancement."
minister:
  name: "Senator The Hon. Jonathan W. D. Reid"
  role: "Minister of Innovation, Industry, Science and Technology"
contacts:
  - { label: Email, type: email, value: "psmist@barbados.gov.bb" }
  - { label: Telephone, type: phone, value: "(246) 535-1200" }
  - { label: Fax, type: phone, value: "(246) 535-1284" }
  - label: Address
    type: address
    value:
      - "3rd and 4th Floor Baobab Tower"
      - "Warrens"
      - "St. Michael"
onlineServices:
  - { formId: start-a-business, label: "Start a business" }
  - { formId: registering-a-business-name, label: "Register a business name" }
associatedDepartments:
  - category: ""
    items: ["Corporate Services", "Technical Management", "Customer Support", "Data Protection Commission", "Legal Unit", "Programme Execution Unit"]
  - category: "Industry"
    items: ["Industry Unit"]
originalSource: "https://www.gov.bb/Ministries/innovation-science-smart-technology"
---

Body content (optional prose, tables, anything landing wants below the header).
```

And **services get a `forms` field** declaring which forms apply:

```yaml
---
title: "Apply for a passport"
description: "..."
source_url: https://www.gov.bb/Citizens/apply-passport
publish_date: 2025-10-24
section: "Travel, ID and Citizenship"
category: travel-id-citizenship
forms:
  - { formId: apply-for-a-passport, label: "Standard application" }
  - { formId: apply-for-a-passport-urgent, label: "Urgent processing (5 days)" }
---

Body — service description prose.
```

## What lands deletes

- `apps/landing/src/content/ministries.ts`
- `apps/landing/src/content/departments.ts`
- `apps/landing/src/content/state-bodies.ts`
- The MDA loaders + glue in `apps/landing/src/lib/`
- Whatever React code currently merges TS + MD at render time

## What landing gains

- One Zod schema (or four — ministry, department, state-body, service) validates every file
- New ministry = one PR, one file
- Renames are diffable
- `apps/web` content collection grows in clarity, not in coupling

## What chat gains

- One parser per entity type (each is ~20 lines of YAML→object code)
- `lib/rag/registries.ts` deletes
- `lib/rag/content.ts` simplifies — no more dual-source joining
- Form linking arrives "for free" via the `forms` and `onlineServices` fields

## Migration plan

### Step 1 — define the schemas (in `packages/landing-content-types` or similar)

```ts
const ministrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.enum(["ministerial", "non-ministerial", "agency"]),
  keywords: z.array(z.string()).default([]),
  shortDescription: z.string().optional(),
  intro: z.string().optional(),
  minister: z.object({ name: z.string(), role: z.string().optional() }).optional(),
  contacts: z.array(contactSchema).default([]),
  onlineServices: z.array(z.object({ formId: z.string(), label: z.string() })).default([]),
  associatedDepartments: z.array(z.object({
    category: z.string().default(""),
    items: z.array(z.string()),
  })).default([]),
  originalSource: z.string().url().optional(),
})
```

Same shape for departments and state-bodies (drop `category`, swap `minister` for `head` on state-bodies).

For services, extend the existing frontmatter type with `forms: z.array(formLinkSchema).default([])`.

### Step 2 — write a one-shot migration script

`scripts/unify-content.mjs`:

1. Read each entry from `ministries.ts` (via dynamic import or AST parse).
2. Find the matching MD file in `ministries/<slug>.md`.
3. Emit a new MD with structured frontmatter + the old body preserved verbatim.
4. Validate against the Zod schema.
5. Write to `apps/landing/src/content/ministries/<slug>.md` (overwrite).
6. Same for departments, state-bodies.

Run once. Commit the output. Delete the script. Delete `*.ts` registries.

### Step 3 — update landing code

- Replace TS-registry imports with a loader that reads MD files and parses frontmatter (gray-matter + Zod).
- One loader function per entity type.
- Build-time content collection (e.g. via Velite or hand-rolled).

### Step 4 — update chat

- Delete `lib/rag/registries.ts`.
- Rewrite `lib/rag/content.ts` to read from the new unified MD files via the canonical Zod schemas.
- Add `formIds` field to `IngestDoc`, surfaced through `/api/retrieve` to chat.
- Update chat's `chat-tools.ts` / `lib/chat/known-forms.ts` to read `formIds` from retrieved sources instead of guessing from URL strings.

### Step 5 — verify

- `pnpm dev` in landing — ministry pages render unchanged.
- `pnpm dev` in chat — `/api/sync` then a couple of ministry queries, retrieval still strong.
- Visual diff on 3-5 landing pages: nothing changed.

## Acceptance criteria

- [ ] One MD file per ministry / department / state-body, full frontmatter
- [ ] `ministries.ts`, `departments.ts`, `state-bodies.ts` deleted
- [ ] Zod schemas in a shared package, both landing and chat import
- [ ] Landing renders identically (manual spot check on 5 ministries, 5 departments, 3 state-bodies)
- [ ] Chat retrieval `score >= 0.5` on these test queries:
  - "who is the minister of finance"
  - "BRA phone number"
  - "who is the minister at MIST"
  - "what services does MIST run"
- [ ] `forms[]` populated on at least one service (passport) and surfaced through `/api/retrieve`

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Landing UI breaks because some component reads `ministry.minister` shape that the migration changes | Run landing in dev after each entity type migrates; commit per entity type, not all at once |
| Zod schema misses an edge case in an existing TS entry | Migration script validates before write; failures abort with a useful error |
| The migration script itself has bugs and clobbers content | Run on a separate branch (this one); review output PR-by-PR before merge |
| Authoring DX worsens because YAML is fiddlier than TS | Generate a JSON Schema from Zod, reference it via `$schema` in each file — VS Code gives autocomplete + validation |
| Some structured field on the `.ts` side has logic (functions, JSX) that doesn't survive YAML | Audit `ministries.ts` first; if any field is non-serialisable, decide: drop it, move it to landing-only config, or invent an MDX path |

## Rollback

This whole work happens on `feat/unify-content-model`. If we abandon mid-migration, just stay on `feat/add-chat` (or `main` after deploy). The new branch and its commits don't affect anything else until merged.

## Out of scope (for this plan)

- The chat-side producer/parser refactor (`lib/rag/parsers/*`) — can happen on top of the unified content, separately
- Form-definitions seeding into the API DB — separate plan
- Web review pages, draft handoff — separate plan
- Velite or LlamaIndex.TS adoption — evaluate after unification

## Decision points before starting

1. **Confirm the frontmatter shape above is OK.** Especially `contacts` (array of typed objects) and `onlineServices` (form link references).
2. **Confirm where Zod schemas live.** Inside `apps/landing/src/`? A new `packages/landing-content-types`? Reuse `packages/form-types`?
3. **Confirm migration approach.** One script run per entity type (commit per entity), or one PR with everything?
4. **Confirm landing code change scope.** Are you willing to also delete the React glue, or do we leave that for a follow-up PR after this lands?

## Effort estimate

| Stage | Effort |
|---|---|
| Schema definitions + JSON Schema gen | 1 hr |
| Migration script | 2 hr |
| Run migration + commit (24 ministries + ~70 departments + ~50 state-bodies) | 1 hr including review |
| Landing loader rewrite | 2 hr |
| Chat ingest rewrite | 1 hr |
| Test + spot-check | 1 hr |
| **Total** | **~8 hr** |

## Recommended sequence

1. Get sign-off on this doc
2. Build schemas + migration script + JSON Schema gen
3. Migrate ministries first (smallest, most impactful) — landing + chat both happy
4. Migrate departments
5. Migrate state-bodies
6. Add `forms` to one service (passport) — proves the form-link contract end-to-end
7. Delete TS registries + glue
8. PR the whole branch
