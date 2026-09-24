# block-kit

The document format the content-as-data spike stores in
`content_pages.body`: a closed palette of block types, the Zod schema they
are parsed by, the validation rules they are checked against, the href
allowlist, and the date arithmetic the bank-holiday calendar needs.

It has no Node imports and no React imports, so both sides of the wire can
use it — which is the point. `apps/api_v2` runs `validateDocument` on every
write, so the rules are enforced where the data lands rather than advised in
a browser that anyone can bypass.

## Entry points

| Import                           | What it is                          |
| -------------------------------- | ----------------------------------- |
| `@govtech-bb/block-kit`          | the barrel                          |
| `@govtech-bb/block-kit/document` | the format and rules, free of React |

Today the two are identical. The block-editor spike's React renderer
(`src/render/`) is not part of #2700 and lands with `landing_v2` in #2702; at
that point the barrel re-exports it and `./document` stays the server-safe
entry point it already is.

## A note on `package.json`

`main`, `types` and `exports` point into `dist/`, unlike the older packages
here whose paths are relative to the build output. pnpm's isolated linker
links `node_modules/@govtech-bb/block-kit` at this directory, not at `dist`,
so this is the only spelling Node resolves at runtime — which is what
`apps/api_v2` does when it runs `node dist/main.js`.

## Tests

```bash
pnpm exec nx run block-kit:test
```
