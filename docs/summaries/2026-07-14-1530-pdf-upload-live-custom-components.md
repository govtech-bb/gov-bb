# 2026-07-14 — #1530: PDF uploads use live custom components in the system prompt

## Context

Issue #1530: the two AI entry points built their system prompt differently.
The text-edit path (`runEditBedrock` in `routes/ai.ts`) called a local
`buildSystemPrompt()` that reads the live `CustomComponent` rows and appends a
`## Live Custom Components` section; the PDF-upload path (`runBedrock` in
`routes/ai-upload.ts`) called the bare `getSystemPrompt()`. So recipes generated
from a PDF never referenced a tenant's custom components, and the author had to
swap stock refs for custom refs by hand in the editor. Plan:
`docs/plans/pdf-upload-live-custom-components.md`. Branch off `main`.

## What we did

- Extracted `buildSystemPrompt` from `routes/ai.ts` into a shared
  `src/ai/build-system-prompt.ts` (verbatim move, comments included).
- `routes/ai.ts`: deleted the local copy and its now-orphaned imports
  (`CustomComponent`, `getDataSource`, `getSystemPrompt`,
  `formatCustomComponentList`); imported the shared helper.
- `routes/ai-upload.ts`: `runBedrock` now `await buildSystemPrompt()` instead of
  `getSystemPrompt()`.
- Adjusted two existing tests in `ai-upload.spec.ts` (see below). No new tests —
  scope was held strictly to the issue.

## Why we did it that way

- **Fix, not a comment.** The issue offered an alternative: if the stock-only
  behavior on the PDF path were deliberate, document it with a comment instead.
  We judged it an accidental inconsistency (the edit path already appends
  components) and fixed it.
- **Extra DB read on the PDF path, accepted.** `runBedrock` previously did no DB
  read; it now does one `CustomComponent.find()` per conversion. This mirrors
  what the edit path already pays, runs once per conversion (not per status
  poll), and is negligible.

## What broke in tests and why

Both were direct, expected consequences of `runBedrock` gaining a DB-backed
async step — not incidental flakiness:

- **`getDataSource` was mocked as a bare `vi.fn()`** (returns `undefined`).
  Once `runBedrock` called `buildSystemPrompt`, the `undefined.getRepository`
  threw, `runBedrock` caught it, and `chat()` was never reached — five tests
  failed on `chatMock.mock.calls[0]` being undefined. Fixed by making the mock
  resolve to a repository whose `find()` returns `[]` (no custom components in
  these tests → bare base prompt, same output as before).
- **One test checked the `chat` call count without flushing microtasks.**
  `buildSystemPrompt` adds an `await` *before* `chat()`, so after the first poll
  `runBedrock` is suspended at the DB read and hasn't called `chat` yet. Added a
  `setImmediate` flush before the assertion, matching how the sibling tests
  already handle the fire-and-forget timing.

## Verify

`form-builder-api:build` clean; `form-builder-api:test` 284 passed, 5 skipped.

## Open questions

None.
