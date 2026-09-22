# Block editor spike — findings

**Date:** 22 September 2026
**Branch:** `spike-block-editor-v2` → `v2-rewrite`. Not for `main`.
**Code:** `packages/block-kit`, `packages/spike-db`, `apps/editor_v2`, `apps/landing_v2`

---

## The question, and the answer

> Can one block document model hold prose, component configuration and
> collection-backed data, and can one editor edit all three?

**Yes for the document model. Qualified yes for the editor. No for the idea
that a finder's behaviour is data.**

All three pages round-trip through one `{version, blocks, refs}` document,
render through one renderer, and are edited in one editor. The severance
page and the bank holiday calendar are comfortable. The pharmacy finder
works — a content designer can add a facet, reorder it, relabel it, change
its options and change pagination, and the page changes with no code — but
only because a developer shipped the predicate that facet filters with.

That is the finding that matters, and it is in §6.

---

## The five questions from the brief

### 1. Does `body` as `{version, blocks, refs}` make `body_source`, `body_hast` and `body_compiler` unnecessary?

**Yes. Drop all three.**

Those three columns exist because a markdown phase needs them: the source
someone typed, the parsed tree, and which compiler produced it. A block
document has no source form other than itself. `body` _is_ the parsed tree,
it is already structured, and the renderer walks it directly.

Evidence: `packages/block-kit/src/render` renders every one of the nine
block types from `body` alone, and the same renderer drives the editor's
preview pane and the site. Nothing in the spike ever needed a second
representation of the same content.

One caveat: this holds _because_ the palette is closed. The moment an
author can write arbitrary markdown, a source column comes back.

### 2. Can the `content_pages_body_shape` CHECK carry real weight?

**No. It proves three keys exist and nothing more.**

`packages/spike-db/src/schema.test.ts` pins both halves. The constraint
correctly rejects a body missing `version`, `blocks` or `refs`. It also
cheerfully accepts:

```json
{ "version": "banana", "blocks": "not-an-array", "refs": 7 }
```

and

```json
{ "version": 1, "blocks": [{ "type": "raw_html" }], "refs": {} }
```

Keep the CHECK — it is free and it catches a whole class of wrong-shape
writes at the boundary. But budget for application-level validation as the
real gate, not as a nicety. In the spike that is the Zod schema plus the
nine rules, and it runs on every read as well as every write.

### 3. Can a JSONB field reference a collection with integrity?

**No, and the contrast is stark.**

`body.blocks[].collection` points at `data_collections.key`. Postgres
accepts a finder block naming a collection that has never existed. The same
reference expressed as a column — `collection_records.collection_key` — is a
foreign key, is enforced on insert, and blocks a delete of a collection that
still has records.

So validation rules 5 to 7 are the only defence, confirmed. They are cheap
and they work: the editor catches a dangling collection, a facet key that is
neither a field nor computed from one, and a result column that is not a
field, all before save, and names the failing block.

The practical consequence for Sprint 1: **anything a JSONB pointer
references needs a publish-time validator, and that validator needs the
collection schemas in hand.** Design the API so it can load them cheaply.

### 4. Does the append-only trigger behave?

**Yes.** `UPDATE` and `DELETE` both raise, in PGlite and in a stock
Postgres 17 after restore. The unique `(entity_kind, entity_id, version_no)`
constraint also holds, so a double-write of the same version is refused
rather than silently accepted.

The editor writes a `change_events` row on every successful save, so this is
exercised rather than merely declared.

### 5. Does the GIN index on `collection_records.data` get used?

**No — and it cannot serve the queries the finder actually makes.**

Recorded either way, as asked:

| Query                                          | PGlite                                  | Postgres 17                            |
| ---------------------------------------------- | --------------------------------------- | -------------------------------------- |
| `collection_key = … AND data @> …`, default    | Seq Scan                                | Seq Scan                               |
| same, `enable_seqscan = off`                   | btree on `(collection_key, record_key)` | **Bitmap Index Scan on the GIN index** |
| `data->>'type' = … AND data->>'pppStatus' = …` | Seq Scan                                | Seq Scan                               |

Three things fall out.

- At 187 rows a sequential scan is correct and `ANALYZE` does not change it.
  Nothing here says the index is wrong, only that it is not yet earning its
  keep.
- `jsonb_path_ops` indexes **containment only**. The pharmacy finder's real
  filters are not containment: `openNow` is a time-of-day computation over a
  weekly-hours object, and `subsidisedOnly` and `slip` span two fields. No
  planner setting puts this index on their path. If those filters are ever
  to be pushed into SQL they need expression indexes or generated columns,
  not a catch-all GIN.
- **PGlite's planner and stock Postgres's planner disagreed** on the forced
  case. PGlite is real Postgres, but do not treat an index finding from it
  as settled without confirming on a server.

---

## 6. The finding the spike was actually for

**A finder's facets are predicates over records, not field/value filters.
None of the pharmacy finder's five facets is expressible as pure data.**

| Facet            | What it looks like | What it actually does                                                                              |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `openNow`        | a checkbox         | evaluates weekly opening hours against the Barbados wall clock                                     |
| `type`           | three options      | `government` is a field value; `private-sbs` is `type = 'private' AND pppStatus = 'participating'` |
| `subsidisedOnly` | a checkbox         | passes government facilities, and private ones only when participating                             |
| `slip`           | four options       | derived from `type` + `pppStatus`; no field holds a slip colour                                    |
| `parish`         | a field value      | except `All parishes`, a wildcard that matches every selection                                     |

Two of the five would work as naive field matching if you accepted a
behaviour change. Three cannot be expressed that way at all.

The spike's answer is to treat this the same way it treats block types: a
closed, developer-shipped registry (`COMPUTED_FACETS` in
`packages/block-kit/src/facets.ts`) keyed by facet key, with generic field
matching as the fallback. What stays editable is everything around the
predicate — the label, the options and their labels, the default selection,
the control type, the ordering, whether it is a scrollable group, and
whether the facet appears at all.

**That is a genuinely useful amount of authoring power and it should not be
oversold.** "Content designers can configure the finder" is true. "Content
designers can add a new kind of filter" is false, and will stay false. A new
predicate is a developer task and a deploy, exactly like a new block type.

Sprint 1 should decide deliberately whether that is the intended contract.
The spike's view: it is the right contract, it matches how the block palette
already works, and the alternative — an expression language in JSONB — is a
much larger thing that would need its own spike.

A second-order consequence: `computed_from` must name **a list** of fields,
not one. The brief specified a single field; `slip` and `subsidisedOnly`
each read two. Rule 6 validates every named field.

---

## 7. Other results worth carrying

### `jsonb` normalises key order, so a byte-identical round trip is not available

The acceptance criterion "saving with no edits produces a byte-identical
body" cannot be met by `jsonb`, which stores a parsed representation and
re-emits object keys sorted by length then bytewise. `{version, blocks,
refs}` comes back as `{refs, blocks, version}`.

Content is untouched — the em dash, the bold marks and the nesting all
survive exactly. And normalisation is idempotent, so the body **is**
byte-stable after the first read, which is what a dirty check needs.

Use deep equality for round-trip assertions. Only reach for `json` over
`jsonb` if byte fidelity genuinely matters, and note that it costs the
operators and the index.

### The brief's own seed data fails the brief's own rule 8

The severance start page carries `target_kind: "page"` pointing at
`/money-financial-support/calculate-severance-pay/form`, which is not one of
the three seeded pages. Rule 8 requires an internal `start_link` to resolve,
so the seed cannot save. The spike seeds the calculator page as a stub.

This is not pedantry — it is the rule working. Rule 8 is the one that will
catch real broken start buttons, and it caught one on day one.

### Substitution is per-holiday, not one policy per calendar

The brief models `substitution_rule: "next-working-day"` on the calendar
block. The Public Holidays Act, Cap. 352 has three distinct rules: six
holidays move Sunday→Monday, Emancipation Day moves Sunday-or-Monday→Tuesday,
and Christmas moves Sunday→Tuesday. A single "next working day" policy
produces days that are not public holidays.

So the trigger is data on each rule row and the block field selects which
policy reads it. `holidays.test.ts` pins the rule engine against the
original generator in `apps/landing` for **every year from 2020 to 2050** —
moving the holiday list out of code and into editable rows provably changed
no date.

### Facets and result metadata are independent configuration

Removing the `parish` facet removes it from the filter sidebar and leaves it
in the result cards, because `parish` is still a field of the collection.
The brief expected one action to do both. Keeping them separate is right —
deleting a filter should not silently delete a column — but it means the
editor has two places to change and a content designer has to know that.
Worth watching in the usability session.

### Three PGlite integration wrinkles

- **React `<StrictMode>` breaks live queries.** Its double-invoked effects
  race PGlite's live-query teardown against the immediate resubscribe, and
  hooks are left permanently unresolved. Development-only behaviour, so a
  production build would have hidden it until someone opened a dev server.
- **Live-query setup takes seconds over the worker.** Long enough that an
  island will render its empty state — "No pharmacies match your filters" —
  before its records arrive. Every data-backed block needs an explicit
  loading state.
- **A live query whose params are rebuilt every render deadlocks the worker,
  silently.** `useRenderData` derived its collection keys with
  `useMemo(..., [doc])`. On the site `doc` is stable and this is invisible.
  In the editor the draft is a new object on every keystroke, so the hook
  handed `useLiveQuery` a fresh params array many times a second, and each
  one tore down and re-created the subscription. The churn deadlocked
  PGlite's single worker connection: the next `save()` never settled, threw
  nothing, and logged nothing — the editor simply sat on "Saving…" forever.
  Memoising on the _contents_ of the key set rather than the document's
  identity fixes it.

  This is the most transferable operational finding in the spike. The bug is
  not in PGlite; the same shape would deadlock any single-connection driver,
  and an API-backed `ApiStore` would instead melt under a request per
  keystroke. **Anything derived from a mutable document and handed to a
  subscription must be memoised on its value, not on the document.**

### Smaller notes

- `pgcrypto` is not in PGlite's base build and has to be loaded as a contrib
  extension. Worth noting that `gen_random_uuid()` has been core since
  Postgres 13, so the `create extension` line can simply go.
- `dumpDataDir` produces a tarball of PGDATA, which only a server of the
  same major version and build can open. `pg_dump` (via
  `@electric-sql/pglite-tools`) produces portable SQL, which is what
  actually hands over. `pnpm --filter @govtech-bb/spike-db verify:restore`
  runs the whole thing: dump, start Postgres 17, restore with
  `ON_ERROR_STOP`, and assert every constraint still _enforces_.
- Lexical was not used. The canonical form has to be `Span[]` either way, so
  the block ↔ editor-state adapter is the whole job; a contentEditable that
  serialises straight to `Span[]` is ~120 lines. `apps/form_builder` remains
  the right precedent when the richer surface is wanted.

---

## What carries forward

1. **`packages/block-kit`** — the types, the Zod schema, the nine validation
   rules, the renderer, the ported date arithmetic and the facet predicate
   registry. This is the durable output.
2. **The schema**, minus `body_source`, `body_hast` and `body_compiler`,
   plus the answers above. `packages/spike-db/migrations/001_init.sql`
   restores into a stock Postgres 17 with no manual correction.
3. **The contract decision in §6** — that a facet's behaviour is code and
   its presentation is data. Sprint 1 should adopt or reject it explicitly.

`apps/editor_v2` and `apps/landing_v2` are deleted. `landing_v2` in
particular must not become the beginning of a new front end: the real
migration strangles `apps/landing` in place behind a `ContentSource`
interface, with a feature flag and dual-read verification.

## Still outstanding

**The config block editor has not been in front of a content designer.** The
brief is right that this is the most valuable thing the spike can produce
and that it is worth knowing in week one. The editor is running and the
finder is editable; the session is the next thing to book, before any of §6
is treated as settled.
