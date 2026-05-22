# safe-payment-url — Vite env access fix — Session Summary

**Date:** 2026-05-22
**Branch:** fix/forms-failing-tests
**Decision record:** none

## Context

A pinned skipped test on `test/increase-coverage`
(`apps/forms/src/lib/security/safe-payment-url.spec.ts`) and an
accompanying NOTE comment claimed that
`process.env.VITE_PAYMENT_ALLOWED_ORIGINS` in
`safe-payment-url.ts` was unreachable in the production browser
bundle — and that the fix was to migrate the source to
`import.meta.env` and shim it for Jest. The session opened with that
pointer.

## What we did

One source change in `apps/forms/src/lib/security/safe-payment-url.ts`:
removed the `typeof process !== "undefined"` guard from
`getAllowedHosts()`. The line now reads
`const raw = process.env?.VITE_PAYMENT_ALLOWED_ORIGINS;` with a comment
naming the Vite `define` shim as the reason the guard was harmful.

No changes to `vite.config.ts`, jest config, or the spec on this
branch (existing 23 tests cover the contract and continue to pass).

## Why we did it that way

**The pointer's diagnosis was wrong about the root cause.** The
claim was "Vite only inlines `import.meta.env.VITE_*` for the browser;
`process` is undefined at runtime so `process.env.X` falls through."
That's a generic Vite truth, but it ignored this project's
`vite.config.ts:11-17`, which has an explicit
`define: { "process.env": { ..., VITE_PAYMENT_ALLOWED_ORIGINS: ... } }`
block that statically inlines `process.env.X` into the browser bundle
at build time.

**The real bug was the defensive guard, not the access path.** Vite's
`define` only replaces the token `process.env`. The token `process`
in `typeof process !== "undefined"` is not replaced, so in the browser
it evaluates against the absent `process` global and resolves to
`"undefined"`. The guard short-circuits before the inlined
replacement is ever read. Removing the guard is sufficient — Vite's
`define` continues to inline the env, and Node's real `process`
keeps Jest working unchanged.

**Why not honour the pointer's "migrate to `import.meta.env`"
prescription.** The project's Jest setup is ts-jest with
`module: "CommonJS"` and `useESM: false` (jest.config.ts:29,
tsconfig.jest.json:5). `import.meta` is not valid syntax in a
CommonJS module — putting `import.meta.env.X` directly in source
would throw `SyntaxError: Cannot use 'import.meta' outside a module`
when Jest executes the compiled file. Honouring the pointer literally
would have required either enabling ts-jest ESM mode (large blast
radius across all specs in this project) or adding a babel transform
for `import.meta` — solving an infra problem the bug doesn't
actually require.

**Alternative considered, rejected.** A `globalThis.__VITE_ENV__`
indirection injected by Vite's `define` would have been cleanly
testable without depending on the `define` block's `process.env`
shim. Rejected as gratuitous — the existing shim already works, and
adding a new global pattern for one env var trades a real fix for
unnecessary surface area.

## What we almost got wrong

Initial instinct was to dispute the pointer purely on "Vite shims
`process.env` here" — true, but incomplete. The shim only works
because `process.env` is *the only* token Vite replaces; the
`typeof process` guard reads a different token and silently defeats
the shim. Without spelling that out, the fix would look like a refusal
to engage with the diagnosis rather than a sharpening of it.

## Open questions

The `test/increase-coverage` branch carries two stale artifacts that
will conflict semantically (not textually) when these branches
converge:

1. The NOTE comment block above
   `describe("custom allowlist via env")` claims Vite only inlines
   `import.meta.env.VITE_*` — incorrect for this codebase because
   of the `define` shim.
2. The `describe.skip("via env (Vite) — un-skip when source reads
   import.meta.env", ...)` block's premise no longer applies. Either
   delete it or replace with a small active test documenting the
   `define`-shim mechanism.

Cleanup belongs on whichever branch closes the loop on this fix.
