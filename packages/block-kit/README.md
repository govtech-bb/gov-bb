# @govtech-bb/block-kit

The block document format: types, schema, validation rules and renderer.

**This package is the part of the block editor spike that is meant to
survive it.** `apps/editor_v2` and `apps/landing_v2` are deleted when the
spike ends; this is not.

## What is in here

| Module        | What it is                                                     |
| ------------- | -------------------------------------------------------------- |
| `types.ts`    | `PageDocument`, `Body`, `Span`, `Ref` and the nine block types |
| `schema.ts`   | the Zod mirror of `Body`, run on every read and every write    |
| `validate.ts` | the nine validation rules, as a pure function                  |
| `facets.ts`   | the computed-facet predicate registry                          |
| `dates.ts`    | date arithmetic, ported verbatim from `apps/landing`           |
| `holidays.ts` | the rule engine over editable holiday rows                     |
| `render/`     | one renderer, used by the editor preview and by the site       |

## The closed palette

Nine block types: `paragraph`, `heading`, `list`, `notice`, `start_link`,
`finder`, `calendar`, `data_table`, `image_placeholder`.

There is no "insert HTML", no raw-JSON escape hatch and no code block. If an
author wants something not on the list, the answer is a new block type
shipped by a developer. The insert menu **is** the content model made
visible.

## Data versus code

Parameters are data; formulas are code.

- Bank holiday **rules** are editable rows. `easterSunday()`, the
  nth-weekday arithmetic and the Cap. 352 substitution logic are not.
- Finder **facet definitions** are editable JSONB — label, options, default,
  control type, order. How a facet _matches a record_ is a predicate in
  `facets.ts`, shipped by a developer and looked up by key.

That second line is the spike's main result. See
[the findings](../../docs/spikes/2026-09-block-editor-findings.md), §6.

## Validation

`validateDocument(doc, { collections, pageUrls })` returns errors keyed by
block id. It takes the collection definitions as an argument so it stays
free of database access and can run in the editor, in a test, or server-side
behind an API.

Rules 5 to 7 are the only thing standing between `body.blocks[].collection`
and a dangling reference — Postgres cannot put a foreign key inside JSONB.

## Tests

```bash
pnpm exec nx run block-kit:test
```

`holidays.test.ts` pins the rule engine against the original generator in
`apps/landing/src/lib/bank-holidays.ts` for every year from 2020 to 2050.
If it fails, moving the holiday list into editable rows changed a date.
