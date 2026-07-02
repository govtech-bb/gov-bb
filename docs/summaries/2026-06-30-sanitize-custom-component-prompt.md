# Sanitize custom-component DB content before it enters the AI system prompt

**Issue:** [#292](https://github.com/govtech-bb/gov-bb/issues/292) — [Important]
Custom component DB content injected into AI system prompt unsanitized.

## What changed

`buildSystemPrompt` (`apps/form_builder_api/src/routes/ai.ts`) previously read
every `custom_components` row and concatenated `namespace`, `type`,
`definition.htmlType`, and `definition.label` straight into the system prompt
with no length cap or escaping. That inline `.map(...).join("\n")` was replaced
with a call to a new `formatCustomComponentList` helper
(`apps/form_builder_api/src/ai/custom-component-prompt.ts`) that sanitizes each
field on read: collapse whitespace runs → strip backticks and angle brackets →
trim → clamp to 80 chars, with non-strings falling back to `unknown` / `no
label`. The DB read stays in `buildSystemPrompt`; only the formatting moved.

## Why it looks the way it does

**Sanitize on read, not blacklist, not "trusted".** The issue suggested escaping
LLM control phrases like `</system>`. Rejected — enumerating injection strings
is unwinnable (you can't escape "ignore previous instructions"). Declaring the
table trusted and closing won't-fix was also rejected. Making the fields
structurally inert (no newlines, no markup/control chars) and bounded is what
actually limits injection, and it's a few lines that are harmless even if the
table later turns out to be trusted.

**All four fields, not just the free-text ones.** Sanitizing `htmlType`/`label`
while leaving the `namespace`/`type` refs raw would be pointless — the ref fields
are interpolated into the same line, so they get the same treatment.

**Byte-identical for clean rows.** The line format and the "## Live Custom
Components" heading are unchanged; the sanitizer is a no-op on values with no
whitespace runs, control chars, or over-length, so existing clean rows render
exactly as before. Only poisoned content is altered. The helper owns sanitizing
+ joining; `buildSystemPrompt` still owns the heading and base-prompt
concatenation.

**Non-string coercion diverges from the old `??`.** The old code used
`def?.htmlType ?? "unknown"`, which only caught null/undefined — a numeric or
object `htmlType` from the `jsonb` column would have been interpolated verbatim.
The new sanitizer coerces any non-string to `""`, so the `unknown` / `no label`
fallback now also covers non-string and whitespace-only values. This is a
deliberate, safer divergence for suspect input; clean string rows are unaffected.

**Read-path only.** No write-boundary validation was added — there is no write
path for `custom_components` in the codebase to attach it to (rows land via
direct DB access). The companion publish-time schema validation (#283) is already
closed.

The principle is recorded in
[ADR 0061](../decisions/0061-untrusted-db-content-is-sanitized-before-entering-llm-prompts.md).

## Tests

12 unit tests in `custom-component-prompt.spec.ts`: whitespace/newline collapse,
backtick strip, `</system>`-style neutralization, 80-char clamp, trim,
non-string/undefined → fallback, clean-row byte-identity, a multi-line injection
payload, multi-row join, and empty-array. Built TDD (RED on missing module →
GREEN). `form-builder-api:test` 246 pass / 5 skipped, `form-builder-api:build`
clean, `tsc -b apps/form_builder_api` clean.
