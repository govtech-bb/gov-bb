# 0008 One lost-answer policy for every editor write

Status: Accepted

Recorded: 2026-11-11

## Context

A write can commit before its answer is lost. A dropped connection, a server error or an unreadable reply cannot prove that the write failed. Seven screens handle this separately, with different rules for checking and retrying. Repeating a request with newer input or a newer version can overwrite an author's work.

The "Clients, uncertainty and public caching" section of [ADR 0132](../../../../docs/decisions/0132-category-write-rules.md#clients-uncertainty-and-public-caching) requires category writes to read back before repeating an uncertain request. Every editor write needs that protection, including creates and deletions.

## Decision

Put the policy in one plain TypeScript write attempt in `src/api/`. Its `press(next)` method represents the author's button. It freezes a copy of the first request and permits one request in flight. Concurrent presses share the pending answer. While the request is unsettled, `next` is not called.

After a lost answer, read back once automatically. If the read confirms the write landed, return the saved answer. Otherwise return `unknown` and retain the frozen request. Never resend automatically. On the author's next press, read back again; confirm if it landed, otherwise resend the frozen request unchanged. A failed read cannot confirm a write. If an explicit resend also loses its answer, give it the same single automatic read-back.

Expose `idle`, `sending`, `checking` and `unsettled` as the attempt's state. `forget()` drops the frozen request after discard-and-reload. It cannot unlock a pending request. Background reads never replace the displayed baseline or the frozen request's version.

Every press returns one outcome: `landed`, `invalid`, `conflict`, `missing`, `signed-out`, `forbidden`, `refused` or `unknown`. Invalid outcomes carry field errors. A refusal is an answer, so every outcome except `landed` and `unknown` carries the API's own sentence when it sent one; a lost answer has no sentence to carry. Refused outcomes retain the API's code and message, and any refusal detail such as category blockers. Screens keep their own wording and see outcome values rather than transport failures. The attempt classifies both thrown API errors and tagged category failures; a successful answer keeps the shape declared by its write. Changing `client.ts` to use one failure style is separate work.

A catalogue defines each write's `send`, independent `readBack` and `landed` check. Only a confirmed absence becomes `undefined`; an unavailable read must not stand in for absence. Creates compare the submitted key and fields. Saves compare both the displayed version and submitted fields. Deletions confirm absence. A landed check may accept `undefined` only when the write's answer type includes it.

A small `useWrite(api, entry)` hook owns the attempt for a mounted screen and invalidates `["content"]` after landed outcomes and lost answers. It also invalidates when the author checks an unsettled attempt again. Read-back does not join a cached query or inherit its retries. Category ordering will keep an attempt per sibling list, rather than one attempt for the screen.

Migrate one screen at a time. This first change adds catalogue entries only for record create, save and delete. Other screens keep their existing implementation until their migration.

## Alternatives

- **Keep screen-local retry rules.** Leaves safety decisions duplicated and lets the copies drift.
- **Resend after a timeout.** A timeout cannot establish whether the write committed, and another send requires the author's decision.
- **Unify the API client's failure types first.** Delays the shared policy without removing the need for it. The attempt can classify both existing styles.

## Consequences

A record save, create or deletion can now be confirmed without a second press after its answer is lost. An unsettled create's next press checks and, if needed, resends the original request instead of only reporting whether its key exists. A new record's key stays read-only while its request is unsettled; other fields remain editable. Version guards and unique keys still decide whether the API accepts a resend; the client does not advance those guards from background data.

The module tests own protocol permutations. Screen tests retain ordinary success, lost-then-confirmed integration, and screen-specific behavior such as field errors, focus, discard and edits made after dispatch. Other screens and page-sync tests remain unchanged in this first migration.

## Evidence

- [Issue #3643](https://github.com/govtech-bb/gov-bb/issues/3643).
- [Write attempt](../../src/api/write-attempt.ts), [record catalogue](../../src/api/writes.ts) and [React hook](../../src/workspace/use-write.ts).
- [Protocol tests](../../src/api/write-attempt.test.ts), [hook tests](../../tests/workspace/use-write.test.tsx) and [record dialog tests](../../tests/workspace/collections-screen.test.tsx).
