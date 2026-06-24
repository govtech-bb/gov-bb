# Single-sourced the AG-UI text-turn event builder into `@govtech-bb/ai-bedrock`

## Context

Issue [#1416](https://github.com/govtech-bb/gov-bb/issues/1416) / DEAD-08, from
the `apps/` consolidation audit (EPIC #1423). Three places built the canonical
AG-UI text-turn event sequence (`RUN_STARTED → TEXT_MESSAGE_START →
TEXT_MESSAGE_CONTENT → TEXT_MESSAGE_END → RUN_FINISHED`) by hand:

- `packages/ai-bedrock/src/stream.ts` — the canonical adapter, building it via
  stateful lifecycle helpers interleaved with the tool-call path.
- `apps/chat/src/lib/chat/static-stream.ts` — jailbreak-refusal path, with an
  in-code comment that it "mirrors what the bedrock adapter emits."
- `apps/chat/src/lib/chat/mock-adapter.ts` — the E2E LLM mock, "mirrors
  ai-bedrock/stream.ts exactly."

The canonical shape lived *outside* the package that owns it, so an adapter
event-schema change would diverge from the two chat consumers only at runtime,
never at compile time — exactly the seams (jailbreak + E2E) where that mismatch
is most confusing.

Worked in worktree `gov-bb-1416` (branch `1416-shared-text-turn-builder`,
targets `sandbox`), from `docs/plans/1416-chat-shared-text-turn-builder.md`.

## What we did

- **New canonical source** `packages/ai-bedrock/src/static-text-turn.ts` —
  `emitTextTurn(text, ids)`, a synchronous `Generator<StreamChunk>` matching
  `stream.ts`'s style. `TextTurnIds = { runId, threadId, messageId, model }`.
  `finishReason` fixed to `"stop"`; no `usage`/`parentRunId`. Re-exported from
  `packages/ai-bedrock/src/index.ts` with the `.js` specifier convention.
- **`static-text-turn.spec.ts`** (TDD, written first, Vitest) — asserts the
  5-event order, run-frame threading of `runId`/`threadId`/`model` +
  `finishReason: "stop"`, and a single content delta carried under the supplied
  `messageId`.
- **`static-stream.ts`** — `staticAnswerStream` keeps its public signature,
  `generateMessageId()`, and `static-${Date.now()}` runId synthesis; its body is
  now `yield* emitTextTurn(...)`. Dropped the six now-unused `@tanstack/ai`
  event-type imports.
- **`mock-adapter.ts`** — `textTurn` delegates (keeps its own `uid("msg")`
  scheme). `toolTurn`/`runStarted`/`runFinished` untouched. Dropped the three
  now-unused text-message-type imports.

## Why it looks this way

- **ai-bedrock is the right home.** It owns the AG-UI event shape and is already
  a dependency of `apps/chat` (`workspace:*`), consumed via its `.` →
  `./src/index.ts` export. No new package edge or project-reference — a pure
  symbol add. chat builds with Vite and isn't in the root `tsc -b` graph, so the
  re-export is all the wiring needed.
- **`stream.ts` was deliberately not touched.** Its emit helpers are stateful —
  lifecycle flags (`hasEmittedTextStart`, etc.) interleaved with the tool-call
  path — so making them consume `emitTextTurn` would be risky churn for no gain.
  Co-locating the canonical builder in the owning package already satisfies the
  issue ("canonical shape lives in one place").
- **`messageId` is a builder input, not generated inside.** Each consumer keeps
  its own id scheme (static-stream: `generateMessageId()`; mock: `uid("msg")`).
  The client keys off `messageId`/`runId`, so this preserves both behaviours
  exactly.
- **One real behavioural change, verified safe.** static-stream switched from a
  single frozen timestamp to per-event `Date.now()` (the builder stamps each
  event, as `stream.ts` does). No test asserts timestamps and the client doesn't
  rely on intra-turn timestamp identity, so this is invisible downstream.
- **The mock's tool-turn stayed out of scope.** `toolTurn` (`TOOL_CALL_*`,
  `finishReason: "tool_calls"`) is genuinely mock-only — not shared with
  static-stream — so it's left as-is.

## Verification

- `pnpm exec tsc -b` — exit 0.
- `pnpm exec nx run ai-bedrock:test` — green (incl. 3 new specs).
- `pnpm exec nx run chat:test` — 157 pass (incl. `static-stream.test.ts`'s
  5-event sequence assertion).
- `pnpm exec nx run chat:build` — green (the real type-check for chat
  call-sites, since chat isn't in the `tsc -b` graph).
