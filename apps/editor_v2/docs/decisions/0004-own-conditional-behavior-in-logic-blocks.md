# 0004 Keep conditional behavior in explicit logic blocks

Status: Accepted (implemented in this repository)

Recorded: 2026-10-05

## Context

An answer can affect several questions or pages: their visibility, required state, wording or navigation. If those conditions live in separate field settings or follow implicitly from indentation, authors cannot reliably find what controls a block. Moving, copying or deleting content can also change behavior unintentionally.

## Decision

Represent answer-dependent changes as explicit Conditional logic blocks containing conditions and actions. A rule may affect multiple targets, subject to the native schema's target and repeat-scope restrictions. For assignments to the same property, the last matching assignment takes precedence; when none matches, the authored baseline applies. Matching error actions accumulate.

Keep placement separate from conditions. Nesting a question under an option does not itself create a rule. The follow-up insertion action deliberately creates the hidden baseline and its visible logic rule together, in one undoable edit. Additional follow-ups under the same answer can share that rule.

This ownership applies to conditional actions, not every value dependency. Static validation, baseline visibility and required settings remain on their blocks. Calculated expressions and inline answer references retain their own structured representations. Reader-operated Details are disclosures, not answer conditions.

This decision records the implemented schema, editor and fixture-tested semantics. It does not assert that the repository provides a production respondent runtime.

## Alternatives

- Infer conditions from nesting. This reduces visible authoring controls but makes layout edits change behavior and cannot express unrelated targets clearly.
- Put conditional settings on each target. This keeps simple edits local but scatters shared conditions and makes interactions harder to inspect.
- Keep rules outside the editable form. This separates concerns in code but weakens discoverability and coordinated undo, copying and deletion.

## Consequences

Authors have one place to inspect conditional actions, and copying or removing a rule has explicit effects. The cost is more visible structure, reference validation and ordering that authors must understand. Baseline settings still matter: removing a Show action does not automatically make its target visible. Import and editing must retain incomplete rules for repair rather than silently inventing behavior.

## Evidence

- [Native condition and action contracts](../../src/forms/schema/types.ts)
- [Follow-up and logic authoring transactions](../../src/forms/features/logic/authoring.ts)
- [Nesting, disclosure and migration regressions](../../tests/forms/logic-rules.test.ts)
- [Native follow-up consolidation and undo tests](../../tests/forms/logic-authoring.test.ts)
- [Fixture interpreter for native rule semantics](../../tests/helpers/native-fixture-interpreter.ts)
