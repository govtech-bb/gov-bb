# Citizen confirmation email acknowledges uploaded documents (#807)

## Context

Issue [#807](https://github.com/govtech-bb/gov-bb/issues/807): the citizen
confirmation email for a conductor-licence submission listed every step's
answers except the Document-uploads step — no mention that the Police
Certificate of Character was received. This wasn't a regression: the email
builder *deliberately* filtered file fields out of every summary section
(`SKIP_TYPES = ["file", "show-hide"]`), with a doc comment and a spec both
encoding the skip as intended. The MDA email only sees files via a separate
attachment path (`email.processor.ts` → `collectUploads()`), which is why the
department got the document while the citizen got silence.

## What we did

Commit `fix(api): acknowledge uploaded documents in submission emails (#807)`:

- Dropped `"file"` from `SKIP_TYPES` in `email-body.builder.ts`
  (`show-hide` stays skipped).
- Added a `case "file"` to `formatValue()` rendering uploaded filenames,
  joined with `", "` for multiples.
- Inverted the "omits file … entirely" spec and added a `file field
  rendering` block (single, multiple, name fallback, keyless skipped,
  null/non-object items, empty/non-array → row omitted).

## Why we did it that way

- **Render the filename, not a generic "File received".** Echoing the actual
  answer is what every other section does; a generic marker would be the only
  field that doesn't tell the applicant what they submitted.
- **Both emails, not citizen-only.** Citizen and MDA bodies share the same
  builder. Threading recipient kind into the builder just to suppress a
  filename the MDA already receives as an attachment would be plumbing for
  asymmetry with no benefit — the summary line next to the attachment is a
  bonus.
- **Mirror `FilesService.collectFileEntries` semantics exactly** (non-empty
  string `key` = durably uploaded; display `name`, falling back to the key's
  basename): the email should acknowledge precisely the set of files the MDA
  attachment path would collect, no more, no less. The logic is *duplicated*
  rather than extracted into a shared helper — deliberately, flagged in a
  code comment, because the two copies live in different modules (email vs
  files) and a cross-module helper for ~6 lines was judged scope creep for a
  bug fix. If `collectFileEntries`' notion of "durable" ever changes, the
  builder's copy must follow.
- **Attachment behavior untouched.** The issue asks for acknowledgement, not
  delivery; citizens already have their own files. The processor's "does NOT
  attach files on the citizen confirmation" spec still passes unchanged.
- **Empty → `""` → row omitted**, matching the builder's existing
  empty-value convention, so a file field with no durable upload can't
  produce a blank row or resurrect an otherwise-empty section.

## Open questions

None — display format and both-emails scope were settled in the planning
discussion (2026-06-04). Optional staging sanity check (resubmit the
conductor-licence form, confirm the Document-uploads section appears) was
not run; unit specs cover the builder fully.
