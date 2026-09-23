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

All five pages round-trip through one `{version, blocks, refs}` document,
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

### A markdown page smuggles presentation; a block page cannot

The Crop Over permits page was added as a fourth case, and it paid for
itself immediately. Its markdown source draws a callout like this:

```html
<div class="border-blue-40 border-l-4 bg-blue-10 p-s">
  <p><strong>Indicative guidance only.</strong> …</p>
</div>
```

Tailwind class names, in a file a content designer owns. Nothing validates
them, nothing stops the next author inventing a different blue, and a change
to the design system silently strands every page that hard-coded a token
name. It is the same failure as an "insert HTML" button, arrived at by a
different route: the palette was closed, but markdown left a hole under it.

As a block it is `{ type: "notice", variant: "info" }` and the renderer
decides what a callout looks like. The author picks _what kind of thing this
is_; the design system picks how it appears.

**This is a stronger argument for the block model than any of the three
original pages made**, and it generalises: an audit of the other 113 pages
for raw HTML in markdown would size the problem quickly, and every instance
found is either a block type that needs to exist or a page that is
freelancing.

One corollary worth carrying: the notice is also the first seeded block that
is neither a paragraph nor a heading and still carries marks. Bold inside a
non-paragraph block round-trips, which had been assumed rather than tested.

### The model could express an inline link; nothing could render one

The hairdressing licence page was added as a fifth case and immediately
broke something the first four had hidden. Its prose links out to the
Hairdressers Regulations, and **no seeded page before it contained a single
inline link**.

The format was fine. `Span` is `{ text?, marks?, ref?, field? }` and `Ref`
already has `external` and `page` kinds, so linked text is a span with both
`text` and a `ref` — and a span with a `ref` and _no_ text is a value
reference. One field, two meanings, cleanly separated.

What did not exist was anything downstream. The renderer ignored `ref` on a
span that had text and rendered the words unlinked; the editor's adapter
dropped the ref entirely, so opening a page with a link and saving it turned
that link into plain text with no warning. A lossy round trip that no test
caught, because no fixture had a link in it.

**The lesson is about coverage, not design.** Three pages chosen to be
awkward in three different ways still shared an accident — none of them
linked anywhere — and the gap survived a full renderer, a full adapter and a
round-trip test suite. When picking fixtures for the real migration, pick
them for the _features_ they exercise, not only for the shapes they are.

### Author-controlled hrefs are stored XSS unless something refuses them

Adding inline links introduced a `javascript:` hole, and reviewing it found
two more that had been there all along: the start button's `target` when
`target_kind` is `external`, and the finder's `result_template.detail_url`.

React does not sanitise `href`. It warns about `javascript:` and renders it
anyway, so any author who can save a body could have put a working script
link on a citizen-facing page. In the spike that author is the one person
using it locally, which is why this is easy to wave away — but `block-kit`
is precisely the part specified to outlive the spike, and in production the
authors are MDA content designers and the readers are the public.

Three layers now refuse it, because one is not enough:

- **The schema**, so an unsafe href cannot reach the database at all and no
  later consumer — an export, an older client, a second renderer — has to
  remember to check.
- **The adapter**, so pasting a `javascript:` link into the editor keeps the
  words and drops the link rather than storing something the renderer would
  only refuse later.
- **The renderer**, which emits an anchor with no `href` rather than a live
  one. Inert and visibly broken beats working and hostile.

Allowed: root-relative paths, fragments, and `http`, `https`, `mailto`,
`tel`. Refused: everything else, protocol-relative `//host` (a path to the
eye, another origin in fact), and a scheme hidden behind control characters
— `java\tscript:` runs, because HTML parsers strip the tab, which is what a
naive `startsWith("javascript:")` check misses.

**The transferable point is that this is a property of the format, not of
the editor.** Any system where a URL is content needs the allowlist beside
the format rather than in whichever component happens to render it, and it
needs it before the first link ships, not after.

### A page's own chrome is not expressible as blocks

Matching the live bank holiday page pixel for pixel turned up a limit that
none of the earlier pages reached. The page carries three pieces of text
that are _about_ the page rather than content in it: "Last updated on 5 May
2026" under the title, the "About this list" section heading set smaller and
in blue above a rule, and the source citation beneath it.

Every one of those renders as an ordinary paragraph or heading, because the
block model has no way for an author to say "this paragraph is metadata" or
"this heading closes the page". The options are all bad in different ways: a
mark like `strong` is presentational and would be abused for everything; a
`last_updated` envelope column solves one case and none of the others; a
`variant` on paragraph re-opens exactly the styling-as-content hole that the
Crop Over page's hand-written `<div class="bg-blue-10">` demonstrated.

The honest read is that a closed block palette buys safety by refusing
long-tail presentation, and a real migration will find a handful of pages
that need a block type nobody has thought of yet. Budget for adding block
types during the migration, not only before it.

Two of the three turned out not to be the author's business at all. "Last
updated on 5 May 2026" was a paragraph an author had typed and would have to
remember to retype; it is now rendered from `updated_at` for every page, so
it cannot drift from the truth — at the cost that it moves on any save,
including one that changed nothing a reader sees. Breadcrumbs are derived
the same way, from the url's category and service against the canonical
taxonomy, rather than stored on the document: the address already encodes
the hierarchy, and a breadcrumb field would be a second copy of the same
fact, free to disagree with the first.

That narrows the finding rather than removing it. Page chrome that restates
something the system already knows belongs to the renderer. What is left —
the "About this list" heading, the source citation — is chrome the system
does _not_ know, and that is where a block type is genuinely missing.

### PGlite costs about 20 seconds on every page load, not just the first

Measured against the dev server: the editor comes up in ~21s and a site page
in ~21s, and navigating to a second page costs the same again. It does not
warm up. Every navigation is a fresh page load, and a fresh page load starts
the worker, opens IndexedDB and replays the schema check from scratch.

This is invisible in normal use — one editor tab, open all day — and brutal
for anything that navigates repeatedly. It is why the "every page has exactly
one h1" test, which visits four pages in sequence, could never fit the default
30-second budget, and why the whole behavioural suite takes about 48 minutes
for 99 tests.

It is a property of running Postgres in the browser rather than a bug to fix
here, but it is the strongest practical argument in the spike for the database
living behind an API: an HTTP read is milliseconds, and the page stops paying
for a database engine it only reads from.

### Adding the tenth block type cost eleven files

The brief specified a closed palette of nine and this document predicted a
migration would find a tenth. It did, almost immediately: every service page
ends with a "Get help" section naming a ministry and repeating its phone
number, email and address as prose. The Drug Service's number was written out
on the pharmacy page, the NIS department's on the severance page, and changing
either meant finding every page that had typed it.

`contact` is that tenth type. Worth recording what it actually took, because
"just add a block type" is said easily:

|                                          |                                                        |
| ---------------------------------------- | ------------------------------------------------------ |
| `types.ts`                               | the interface, the union, `BLOCK_TYPES`                |
| `schema.ts`                              | a Zod member and its place in the discriminated union  |
| `validate.ts`                            | a rule, plus adding it to `spansOf` and `blockRefKeys` |
| `render/contact.tsx`                     | the renderer                                           |
| `render/document.tsx`, `render/index.ts` | dispatch and export                                    |
| `render/styles.css`                      | its styles                                             |
| `new-block.ts`                           | a label and a sensible empty value                     |
| `blocknote/schema.tsx`, `adapter.ts`     | the editor's node spec, the config-type set            |
| `blocknote/slash-menu.tsx`               | its description                                        |
| `blocknote/block-controls.tsx`           | reaching its records through the ref                   |
| `blocks/config.tsx`, `blocks/index.tsx`  | its settings form                                      |

Two of those are easy to miss and fail quietly. Leaving it out of `spansOf`
means links inside its prose escape rule 4 and the href allowlist — a stored
XSS hole opened by omission rather than by a mistake. Leaving it out of
`blockRefKeys` means its `source` is never checked to resolve.

The honest read is that a closed palette is not expensive to extend, but it is
not free either, and the cost is concentrated in exactly the places where
forgetting is silent. A checklist in the repo would be worth more than the
comment saying the palette is closed.

### The author owns the words; the collection owns the facts

The contact block splits one section in two, and the split turned out to be
the useful part of the design. The heading and description are the author's,
because they differ per page — "Get help" and "Need help or advice?" say
different things about the same department. The details are not: a phone
number is the same fact wherever it appears, so it lives in `ministries` and
the page refers to it.

That makes the demonstration concrete. Changing the Drug Service's number in
the collection changes it on every page showing it, without any page being
edited — and because the details come from a record, the editor's pencil on a
contact block opens the ministry rather than the block's own configuration,
which is the thing an author actually wants when a number is wrong.

The same split is what the four-paragraph postal address needed and could not
express. It is now a `dt`/`dd` pair like everything else in the block, which
is also better markup than the paragraphs it replaced.

One correction, because the first attempt got the control wrong. The contact
block was initially given the same treatment as a finder — pencil opens the
collection's records, cog opens the block's settings — on the reasoning that
a wrong phone number is what an author comes to fix. That conflated "reads
from a collection" with "lists a collection". A finder, a calendar and a
data_table put many records on a page, so editing those records is the
obvious thing to want from them. A contact block shows one record, chosen in
its own settings, and the thing an author wants from it is the heading, the
description and which organisation it names.

The same mistake had been made in the block's shape: it pointed at its record
through a `body.refs` key, which meant the settings form asked an author to
choose between `r_drug_service` and `r_nis`. It now names its collection and
record directly, as a finder and a calendar do, and the form offers
organisations by name. Generality the person using it cannot read is not
generality worth having.

### A page can belong to two categories; a url can hold one

The severance entry page's frontmatter lists `categories: [money-financial-support,
work-employment]`. Both are true — being made redundant is a money problem and
an employment problem, and a citizen might reasonably look under either.

The spike derives the address from one category, and the breadcrumbs from the
address. So the second category is not stored anywhere: it is dropped at seed
time and nothing downstream can tell it existed. The page lives under money
and is invisible under work.

This is the cost of deriving structure from the url rather than storing it.
The url-as-hierarchy choice is still the right one — it is why breadcrumbs
cannot disagree with the address — but it cannot express a page filed in two
places at once. A real migration needs either a categories join table with the
url naming only the _primary_ one, or an accepted rule that every page has
exactly one home. The existing estate has already answered that question the
other way, so this needs deciding before content moves.

### The block palette has no line break

The NIS address on the severance entry page is four lines — department,
building, road, parish — written in markdown with trailing-space hard breaks.
The palette has paragraph but nothing for "new line, same block", so it
renders as four paragraphs with paragraph spacing between them. It reads as a
loose list rather than an address.

Every option is unattractive in the familiar way: a `line_break` mark is
presentation smuggled into content, an `address` block type is one narrow
type that will be followed by requests for others, and allowing newlines
inside a span's text makes whitespace significant in a field nothing else
treats that way. Postal addresses, opening hours and anything else written as
a short stack of lines all hit it. Worth solving once, deliberately, rather
than per page.

### Rule 8 checks start links, but nothing checks an inline link

Adding the pharmacy entry page from the live estate made this visible. The
page carries two inline links to pages the spike does not seed —
free-or-subsidised-medication and prescription-colours. They are `page` refs,
and they save without complaint, because rule 8 only requires a **start_link**
to resolve.

That asymmetry is defensible as far as it goes: a start button that leads
nowhere is a dead end in a transaction, and an inline link is a lesser
failure. But it means an estate can accumulate broken inline links
indefinitely while every start button stays sound, and nothing in the editor
would say so. The check already exists and already has the page list it needs
— `ctx.pageUrls` — so extending it to `page` refs is a small change with one
real consequence: pages would have to be migrated in dependency order, or
seeded with the links temporarily broken, because the target has to exist
before the link to it can save.

Worth deciding deliberately rather than by omission.

### `refs` and `data_table` had never been exercised at all

Every document seeded before the hairdressing page had `refs: {}`, and the
`data_table` block — built deliberately as the brief's control case, to
prove the config-block pattern generalised beyond the two blocks that needed
it — had no consumer anywhere.

That page uses both: an `external` ref behind the Regulations link, and a
`query` ref that a `data_table` reads the seven Environmental Health offices
through. The offices had been a hand-typed markdown list repeated across
Environmental Health pages; as a collection, changing a polyclinic's phone
number once fixes every page listing it.

The control case worked — `data_table` needed no changes to render real
data, which is the evidence the brief wanted that config blocks generalise.
But it is worth being blunt that it went four pages without a single user,
and a block type with no consumer is a block type nobody has checked.

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
