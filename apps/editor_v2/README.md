# editor_v2 — spike block editor

A block editor over the documents in `packages/spike-db`, with a live
preview rendered by `packages/block-kit`.

**Throwaway.** This app is deleted when the spike ends. What survives is
`block-kit`, the schema, and the answers in
[the findings](../../docs/spikes/2026-09-block-editor-findings.md).

## Running it

```bash
pnpm exec nx dev editor-v2
```

One dev server on `http://localhost:3010`, serving **two route trees from
one origin**:

- `/editor` — the page list
- `/editor/$id` — the editor, with the preview pane
- everything else — `@govtech-bb/landing-v2`, resolved against
  `content_pages.url`

The single origin is not a convenience. IndexedDB is scoped per origin, so
an editor on `:3001` and a site on `:3000` cannot see each other's database.
Open the site in a second tab and edits appear there live, with no reload.

The database migrates and seeds itself on first load. To start over, clear
site data for `localhost:3010`, or call `reset()` from `@govtech-bb/spike-db`.
`window.db` is exposed for poking at the database from the console.

## What to try

- Open **Search for pharmacies**. Add a facet, reorder it, relabel its
  options, change results per page. The preview changes with no code.
- Give a facet a key that is neither a field of the collection nor
  `computed_from` one. Save is refused, the rule is named, and the failing
  block is outlined.
- Open **Check bank holiday dates** and change the substitution policy from
  Cap. 352 to "next working day". Dates move, because the naive policy is
  wrong for Barbados.

## Known limits

- No `<StrictMode>`: its double-invoked effects race PGlite's live-query
  teardown and leave hooks permanently unresolved. See the findings.
- Prose editing is a `contentEditable` serialising to `Span[]`, using
  `document.execCommand` for marks. Deprecated, and the shortest correct
  path to "bold the selection" in every browser. A spike is where that trade
  is worth taking.
- Sorting by distance falls back to name; the spike does not ask for
  geolocation.
