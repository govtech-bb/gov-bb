# 0076 — Server-function modules import heavy server-only dependencies lazily

**Date:** 2026-10-06
**Status:** Accepted

## Context

TanStack Start compiles a module that defines a `createServerFn` twice:

- On the server, the handler stays as written.
- On the client, the handler is replaced with an RPC stub. Imports used only by the handler are dropped, but only when Rollup can prove they have no side effects.

Libraries such as unified, remark and rehype can't be proven side-effect free.

In #2944, `apps/landing/src/lib/api-v2-page.ts` imported `processMarkdown` at the top of the module, and the server function used it to compile api_v2 markdown. The handler and `fromApiV2` were both removed from the client build, but the parser's own imports stayed. The result was about 344 KB of remark/rehype in landing's main client entry chunk: 2,279,129 → 2,623,749 bytes.

Nothing else caught it. The tests passed, the typecheck passed, and the page rendered correctly. Only grepping the production build's client assets showed it.

## Decision

**In a module that defines a server function, import a heavy dependency the client never needs (parsers, SDKs, DB drivers, crypto libraries) with a dynamic `import()` inside the function that uses it. Don't use a top-level `import`.**

```ts
// Dynamic so the parser stays out of the client entry.
const { processMarkdown } = await import('../utils/markdown')
```

Two cases are exempt:

- Light imports, and imports the client bundle already contains, such as the content registry.
- Type-only imports.

The alternative is a separate server-only module (`*.server.ts`). Use that when there are several such dependencies and keeping them apart is clearer.

## Consequences

- A change that adds a top-level import of a heavy dependency to a server-function module needs a production client-build check. Run `vite build`, then grep the client assets for a marker of the dependency, for example `micromark` or `rehype-raw` for the markdown parser.
- On the server, the dynamic import costs a module lookup on each call after the first, which is negligible. On the client, the code path never runs.
