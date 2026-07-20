# Session summary — Single source of truth for the S3 upload-key shape (#1852)

**Date:** 2026-07-17 · **Branch:** `refactor-1852-submission-key` (off `main`)

## What shipped

The upload-key layout `uploads/<formId>/<stepId>/<fieldId>/<yyyy>/<mm>/<uuid>-<name>`
was hand-encoded in 4 spots that had to stay in sync. Now it lives once in a new
`apps/api/src/files/submission-key.ts` (segment fragments + `buildSubmissionKey`,
`parseSubmissionKey`, `SUBMISSION_KEY_PATTERN`, `submissionKeyPrefix`), and the
3 production spots compose from it:
- `confirm-upload.dto.ts` → `@Matches(SUBMISSION_KEY_PATTERN)`
- `files.service.ts` → `buildSubmissionKey` / `parseSubmissionKey` (the private
  `buildKey`/`parseKeyTuple`/`sanitizeFileName` and the unused `uuid` import are gone)
- `email.processor.ts` → `submissionKeyPrefix(payload.formId)` for the foreign-form guard

## Why it looks the way it does

- **Shared fragments, not one regex.** The three encodings can't be one regex:
  the DTO must *accept* legacy tuple-less keys (optional stepId/fieldId, still in
  flight since #1745/#284) while the parser must *require* the tuple, and the DTO
  is case-sensitive while the parser is `/i`. So the single source is the *segment
  sub-patterns* (formId/stepId/fieldId/uuid/date), composed differently into a
  permissive DTO pattern and a strict parser.

- **Behaviour preserved exactly, on purpose.** Composing from fragments made the
  pre-existing case-sensitivity drift visible (the `/i` parser accepts an
  uppercase formId the DTO rejects). That's deliberately left as-is — "should
  uppercase formId be allowed?" is a *separate* issue (#1853). This stays a pure
  refactor. Proof: `files.service.spec.ts` passes **completely unchanged**.

- **The spec is an independent witness.** #1852 listed the spec as one of the "3
  places", but a test that *derives* from the shared source can't catch a bug *in*
  it. So only the 3 production spots were deduped; `files.service.spec.ts` keeps
  its own literal key assertions.

## Verification

`submission-key.spec.ts` (build↔parse round-trip; pattern accepts tuple + legacy,
rejects forged) passes; `files.service.spec.ts` + `email.processor` pass;
`api:build` compiles. Full api suite: 1172 pass / 2 fail — both **unrelated and
environmental**: the known local-DB migration smoke (stale rows; fresh DB
unaffected), and a flaky fs-watch recipe-file-loader hot-reload test that passes
31/31 in isolation. Neither references the changed files.
