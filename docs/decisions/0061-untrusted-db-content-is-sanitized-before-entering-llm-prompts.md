# 0061 — Untrusted DB content is sanitized before entering LLM prompts

## Context

The form-builder AI assembles a system prompt from two sources: a static
embedded prompt (guarded against registry drift, ADR 0020) and the live
`custom_components` table. `buildSystemPrompt` read every row and concatenated
`namespace`, `type`, `definition.htmlType`, and `definition.label` straight into
the prompt that every AI edit/convert action reuses — with no length cap, no
escaping, and no neutralization of prompt-control or markup characters
(issue #292).

A poisoned row could therefore inject prompt-control text (`</system>`, "ignore
previous instructions", fenced-block escapes) or unbounded content into a prompt
shared across every user and session. The exposure today is integrity /
defense-in-depth rather than open exploitation — the surface is behind
`authMiddleware` and there is no write path for `custom_components` in the
codebase — but the data still feeds an LLM system prompt, which is the part that
matters.

The issue text suggested blacklisting LLM control phrases (escape `</system>`).
That was rejected: enumerating injection strings is a losing game — you cannot
escape "ignore previous instructions". Declaring the table "trusted" and closing
won't-fix was also rejected — the fix is small and harmless even under a trusted
assumption.

## Decision

DB-sourced content that gets spliced into an LLM prompt is treated as untrusted
input and made **structurally inert and length-bounded on read**, rather than
relying on a blacklist or a trust assumption about the source table.

The sanitizer (`apps/form_builder_api/src/ai/custom-component-prompt.ts`)
applies, per field:

- collapse all whitespace runs to a single space (kills newlines, so a value
  cannot open new prompt lines),
- strip backticks and angle brackets (neutralizes `</system>`-style markers and
  fenced-block escapes),
- trim, then clamp to 80 characters,
- coerce non-strings to empty so the caller's fallback (`unknown` / `no label`)
  takes over.

It is applied to **all** interpolated fields, not only the "free-text" ones —
sanitizing `htmlType`/`label` while leaving the `namespace`/`type` refs raw would
be pointless. The prompt's line format and heading are unchanged, so a clean row
renders byte-identically to before; only poisoned content is altered.

## Consequences

- Future code that interpolates stored (or otherwise untrusted) content into an
  LLM prompt must sanitize on read in the same shape. Reviewers should treat raw
  DB content concatenated into a prompt as a defect, mirroring how raw PII in a
  log line is treated (ADR 0058).
- The 80-char clamp bounds each field; a value longer than that is truncated in
  the prompt. This is acceptable — prompt lines are descriptive, not data of
  record.
- This is a read-path hardening only. No write-boundary validation is added,
  because no write path for `custom_components` exists to attach it to; if one is
  introduced later it should validate at the boundary in addition to this.
