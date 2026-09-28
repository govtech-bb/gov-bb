# block-kit

The document format the content-as-data spike stores in
`content_pages.body`: a closed palette of block types, the Zod schema they
are parsed by, the validation rules they are checked against, the href
allowlist, and the date arithmetic the bank-holiday calendar needs.

The format has no Node imports and no React imports, so both sides of the
wire can use it — which is the point. `apps/api_v2` runs `validateDocument`
on every write, so the rules are enforced where the data lands rather than
advised in a browser that anyone can bypass.

## Entry points

| Import                             | What it is                              |
| ---------------------------------- | --------------------------------------- |
| `@govtech-bb/block-kit`            | the barrel: the format and the renderer |
| `@govtech-bb/block-kit/document`   | the format and rules, free of React     |
| `@govtech-bb/block-kit/styles.css` | the renderer's styles                   |

The React renderer (`src/render/`) arrived from the block-editor spike with
`landing_v2` in #2702. Only the barrel re-exports it; `./document` stays the
server-safe entry point, which is the only one `apps/api_v2` imports.

## A note on `package.json`

`main`, `types` and `exports` point into `dist/`, unlike the older packages
here whose paths are relative to the build output. pnpm's isolated linker
links `node_modules/@govtech-bb/block-kit` at this directory, not at `dist`,
so this is the only spelling Node resolves at runtime — which is what
`apps/api_v2` does when it runs `node dist/main.js`.

The one exception is `./styles.css`, which points at `src/render/`: `tsc`
does not copy CSS into `dist`.

The package compiles with `module: nodenext` rather than `commonjs`. The
design system is ESM-only and publishes its types only through its `exports`
map, which the base config's `node` resolution ignores and `nodenext` reads.
The output is still CommonJS, because this `package.json` has no
`"type": "module"`. `./document` never loads the renderer, so the CommonJS
`require()` of an ES module in `dist/src/render/` is never executed.

## Tests

```bash
pnpm exec nx run block-kit:test
```
