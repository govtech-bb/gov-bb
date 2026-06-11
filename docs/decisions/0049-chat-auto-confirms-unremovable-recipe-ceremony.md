# 0049 — The chat auto-confirms recipe ceremony it can't remove

## Status

Accepted (2026-06-11)

## Context

The in-chat conversational forms reuse one generic pipeline driven by the
published recipe (the live forms-API contract). A recipe therefore dictates what
the chat collects, reviews, and submits — including ceremony that belongs on a
full government application but is wrong on a lightweight conversational form.

The `chat-feedback` form is the case in point. Its recipe carries the standard
required `declaration` step (ADR 0041 — exactly one `components/confirmation`
field, `declaration-confirmed`). On a 30-second feedback form, making the user
confirm a permit-style declaration is the wrong experience, so #1114 removed the
step by cutting a new recipe version (`1.2.0`) without it.

That fix did not hold. The recipe is republished through the form-builder, which
**always regenerates a declaration step** (ADR 0041's builder seed) — versions
`1.4.0` and `1.5.0` brought it straight back, and the loader serves the highest
semver. Deleting the step from the recipe is not a durable lever: any future
republish re-adds it, silently regressing the in-chat experience.

We needed a fix that survives republish, without weakening the recipe contract
for real forms (a real application's declaration is legally load-bearing and
must always be confirmed by the user).

## Decision

When a chat-collected form's recipe carries a required field that is wrong for
the conversational flow **and cannot be durably removed from the recipe**, the
chat **auto-confirms** it rather than fighting the recipe:

- The field is **never disclosed** to the model, **never asked**, and **never
  shown** in the check-your-answers review — every field-surfacing path in the
  pipeline skips it (`isAutoConfirmedField`).
- A satisfying value is **seeded at the submission boundary** (`submit.ts`), on a
  copy of the collected values, so the field never enters `session.values` (which
  is why review and the model's "already collected" view omit it for free). The
  forms API still receives a valid, required value.
- Auto-confirm is **scoped per form**, keyed by `formId → stepId`
  (`form/auto-confirm.ts`). It applies to the listed form only; every other
  form's fields — declarations included — are collected and confirmed by the user
  exactly as before.

This supersedes #1114's recipe-deletion approach for the feedback declaration.
The recipe remains the single source of truth for real forms; the chat adapts
around the ceremony it owns, in code, where republish can't undo it.

## Consequences

- The chat-feedback declaration is filled invisibly; future form-builder
  republishes of `chat-feedback` no longer regress the in-chat flow.
- Adding another auto-confirmed field is a one-line config entry
  (`AUTO_CONFIRMED_STEPS`) plus the guarantee that the field's required value can
  be derived from its definition (option value(s), else `"true"`).
- The recipe and the forms API are untouched — no special-casing of shared
  submission infrastructure, no per-form server logic (contrast the reference-
  number suppression, which also lives chat-side for the same reason).
- The mechanism is a deliberate exception, not a general escape hatch: it exists
  for ceremony the chat cannot remove. A field the chat simply *doesn't want* on
  a form it controls should be fixed in the recipe; auto-confirm is for fields
  the recipe will keep regenerating regardless.
