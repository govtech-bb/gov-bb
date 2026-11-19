# 0006 Keep draft persistence in the host

Status: Accepted (implemented in this repository)

Recorded: 2026-10-05

## Context

An editor can be embedded without browser storage, and multiple editors need independent drafts. Source editing and JSON import can replace an entire document. Parsing errors, intervening edits, storage failures or editor update failures must not silently destroy the previous draft or its recovery evidence.

## Decision

Keep persistence outside the reusable editor. The host supplies storage, draft keys, a codec and an editor connection to a storage-independent draft state machine. The host also owns browser lifecycle listeners, conflict and recovery controls, and downloads. The saved format is described in [ADR 0003](0003-preserve-editable-drafts-in-markdown.md).

Keep host read-only policy separate from temporary pauses for unapplied source, conflicts or recovery. Clearing a draft pause must not make a host-controlled read-only editor editable.

Treat whole-document replacement as a recoverable operation. Prepare and parse the candidate before writing, reject stale replacement requests, and record exact prior and candidate bytes in a journal before committing the saved source. Apply the prepared state as one undoable replacement. If application fails after the storage commit, retain the journal and freeze further changes for explicit recovery. Cleanup failures retain evidence for retry without applying the document again. Migrations preserve original bytes before their first canonical write.

## Alternatives

- Persistence inside editor components would reduce host wiring, but bind reusable editing to a storage format and browser lifecycle.
- A global draft store would simplify access, but make independent editors and draft identities harder to isolate.
- Replacing the canvas and relying on autosave or undo would avoid journal management, but could lose the prior saved bytes or leave storage and the visible editor disagreeing after a failure.

## Consequences

Editors can run without persistence, while hosts can inject distinct stores and codecs. The host must manage connection lifetimes and expose recovery states. Replacement handling is more involved than an unconditional save, and unresolved recovery can block further editing.

The current storage interface is synchronous and the browser host uses `localStorage`. Journaling provides recovery from partial writes and editor failures; it does not provide database atomicity or collaborative editing. Cross-tab checks detect conflicts rather than merge concurrent work.

## Evidence

- [Injected storage, codec and connection contracts](../../src/persistence/types.ts)
- [Browser storage and draft identity ownership](../../src/host/govbb-draft.ts)
- [Replacement ordering and recovery state machine](../../src/persistence/draft-store.ts)
- [Replacement, failure and migration backup tests](../../src/persistence/replacement.test.ts)
