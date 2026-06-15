# Bedrock: don't replay tool blocks on a no-tool turn

## Context

Follow-up to #1202 / #1226. After #1226 made a zero-value `chat-feedback` pin
release on a topic switch, the released turn started **erroring** instead of
trapping: the user gave feedback, the model asked the rating (`ask_field`), the
user typed "conductor license", and the chat returned *"Something went wrong —
we couldn't get a response."*

## Root cause

`apps/chat`'s `api.chat` returns a 500 on any unhandled throw in `runTurn`
(`handlePostSafely`), which the client renders as that error bubble. The throw
was in the Bedrock model stream.

AWS Bedrock's **Converse API rejects** (`ValidationException`) a request whose
`messages` contain `toolUse`/`toolResult` blocks but which has **no
`toolConfig`**. The chat adapter builds `toolConfig` from the turn's tools, and
`toolsToBedrockToolConfig([])` returns `undefined` — so a turn that binds zero
tools sends no `toolConfig`.

The feedback-release turn does exactly that: releasing the form routes to a
handoff (conductor licence), whose action binds **no tools** — while the
released form's `ask_field` `toolUse` (and its tool result) are still in the
message history. No `toolConfig` + tool blocks in history → `ValidationException`
→ the adapter emits a `RUN_ERROR` chunk → broken stream → 500.

This reconciled all three observed behaviours:

- **Fresh user "conductor license"** → no tool blocks in history + no toolConfig
  → valid → works.
- **Pre-#1226 trap** → stayed in `collect-feedback`, tools bound → `toolConfig`
  present → the `ask_field` toolUse was valid → no error (just looped).
- **Post-#1226 release** → `tools = []` for the handoff → no `toolConfig`, tool
  blocks still in history → `ValidationException` → 500.

(The `ask_field` toolUse is *resolved* — it has a matching tool result — so the
trigger is purely the missing `toolConfig`, not a dangling toolUse.)

## What we did

In `@govtech-bb/ai-bedrock`:

- `modelMessagesToBedrock` takes a new `opts.includeToolBlocks` (default
  `true`). When `false`, it skips tool-result messages entirely and omits
  assistant `toolCalls` — so the converted history carries no tool blocks.
- Added a `pushMerged` helper that merges consecutive same-role messages.
  Dropping a tool-call-only assistant turn between two user turns would
  otherwise leave a non-alternating sequence, which Bedrock also rejects;
  merging keeps the output strictly alternating. (It is a no-op on already
  alternating input, so the normal with-tools path is unchanged.)
- `adapter.chatStream` passes `includeToolBlocks: toolConfig !== undefined` —
  i.e. drop tool blocks exactly when the request will carry no `toolConfig`.

## Why here, not in run-turn

The invariant — "a Bedrock request with tool blocks but no `toolConfig` is
invalid" — is a property of the Bedrock request, so the adapter is the correct
layer. Fixing it here also closes the whole class of bug: **any** zero-tool turn
that follows tool use (not just the feedback case) is now handled, and the fix
is unit-testable without standing up the chat runtime.

## Verification

- `ai-bedrock:test` (21, +2 new), `chat:test` (183), `ai-bedrock` + `chat`
  builds — all green.
- The deterministic part (adapter produces a valid Bedrock request) is unit
  tested. The end-to-end fix (the conductor-licence handoff now streams instead
  of erroring) is only fully verifiable on the Amplify preview — the original
  500 was diagnosed by inference from the adapter code + the Converse API
  constraint, not from a captured CloudWatch stack trace.
