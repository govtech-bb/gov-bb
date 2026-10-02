# 0067 — Behaviours declare their runtime support; the editor disables, never silently accepts

**Date:** 2026-08-19
**Status:** Accepted

## Context

The forms runtime only honours some behaviours on some field types. `fieldArray`
("Answer more than once") is repeated only by the renderers that go through
`renderRepeatableOrSingle` — the text-like inputs (`text`, `number`, `time`,
`tel`, `email`) and `textarea`. Until #2317, the Form Builder offered Field
Array on **every** field type: attaching it to a select, radio, date or file
field was accepted by the editor, passed publish validation, and then did
nothing at runtime. No warning anywhere — the author only found out (or didn't)
by testing the live form.

Nothing in the descriptor system expressed "this behaviour works here";
the runtime's support surface lived implicitly in `apps/forms`' renderer
wiring, invisible to the authoring tool.

## Decision

**A behaviour that the runtime only honours on some field types must declare
them in its `BehaviourTypeDescriptor` via `supportedHtmlTypes`.** The
behaviours editor keeps an unsupported behaviour visible in the "+ Add
Behaviour" dropdown but **disabled, with a stated reason** (option suffix +
one hint line) — it is never hidden, and never addable.

Two corollaries:

- An authoring control must never accept a configuration the runtime silently
  ignores. If the runtime gains or loses support for a field type, the
  descriptor's `supportedHtmlTypes` changes in the same PR.
- Disabled-with-a-reason beats hidden: authors learn the rule from the
  stated constraint; an absent option just looks like a missing feature.

`fieldArray` is the first adopter (`["text", "number", "time", "tel",
"email", "textarea"]`). A descriptor without `supportedHtmlTypes` means
"all field types" — the field is opt-in, only for behaviours with a real
runtime restriction.

## Consequences

- New behaviours (or new runtime renderers) must audit which renderers honour
  them and declare the result; "works everywhere" stays the undeclared default.
- The editor needs the edited field's identity to evaluate the gate — the
  `currentField` prop threaded from the field edit panel. Step-scope
  behaviours pass nothing and are unaffected.
- The availability hint copy is hand-written English next to the declaration
  it mirrors (marked keep-in-sync); a second adopter needs its own wording.
- The gate is authoring-time only: recipes published before the gate (or
  edited by hand) can still carry unsupported combinations, which the runtime
  ignores exactly as before. Runtime hardening is out of scope here.
