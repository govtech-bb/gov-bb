# Legacy SSB compatibility

This record describes the explicitly selected legacy SSB adapter, checked against the local SSB schema and renderer on 2026-10-04. The current [native v2 contract](CONVERTERS.md#native-contract) is defined separately.

The builder's `compileForm` returns a derived legacy projection with the limitations below. It does not export a complete deployable SSB recipe. Markdown saves retain authored data even when SSB cannot represent it.

Conditional logic blocks own answer-dependent behavior. Markdown version 1 and legacy drafts migrate to version 2; indentation in version 2 controls layout only.

## Mappings and limitations

Builder paths below are relative to `src/`. SSB paths refer to the external schema and renderer inspected for the 2026-10-04 compatibility review; they are not files in this repository.

### Basic fields, IDs, validation, disabled fields and number/time increments

SSB primitive properties and registry references; compile retains applicable settings.

Evidence: Builder `forms/editor/ssb.ts`, `forms/editor/compile.ts`; SSB `packages/form-types/src/primitive.type.ts`.

### Show blocks, including option follow-ups

A Show rule maps to `shownWhen` / SSB `fieldConditionalOn` only when:

- Every target starts Hidden, including its question label and hint.
- The targets and condition answers are on the rule's page.
- Conditions use supported equality or choice-membership comparisons.

All-match groups may contain several comparisons. SSB supplies the hidden-until-matched baseline. Competing visibility rules, any-match groups, date transforms, individual question fragments and cross-page targets are retained with a warning.

Evidence: Builder `forms/adapters/ssb/logic-rules.ts`; SSB `behavior.type.ts`, field renderer reveal paths.

### Form registry copies

Insert editable copies of named fields or curated groups, including ordinary Show rules. Supplied IDs and option values are snapshots; component refs remain provenance. A future recipe adapter must honor authored overrides and removed defaults instead of re-inheriting validation from the ref.

Evidence: Builder `forms/editor/registry.ts`, `forms/source/dialect.ts`; frozen Markdown profile/default snapshots.

### Reader-operated show/hide sections

These remain disclosure containers. Content-only sections use content/details; sections containing fields emit the disclosure's own open-state condition. Answer-dependent visibility of the entire section belongs to a logic block.

Evidence: Builder `forms/adapters/ssb/nesting.ts`; SSB `behavior.type.ts`.

### Repeating pages and answers

SSB `repeatable` and `fieldArray` behaviours.

Evidence: Builder `forms/adapters/ssb/repetition.ts`; SSB `behavior.type.ts`.

### Change question label / Change page title actions

Logic blocks produce ordered SSB `conditionalLabel` / `conditionalTitle` entries. The first matching action in document order wins; ordinary wording is the fallback. Each wording action supports one comparison: equality, inequality, membership, answer existence or a numeric comparison.

If any wording rule for a target cannot map, the adapter withholds that target's entire wording list and warns. This preserves first-match semantics. Imported transforms and literal values are retained. These are legacy SSB semantics; see [ADR 0004](decisions/0004-own-conditional-behavior-in-logic-blocks.md) for native rule semantics.

Evidence: Builder `forms/adapters/ssb/logic-rules.ts`, `forms/core/dynamic-text.ts`; SSB `behavior.type.ts`.

### Address lookup, opening hours, grouped checkboxes

SSB primitive kinds; editor draws authoring previews, not live geocoding or response entry.

Evidence: SSB `primitive.type.ts`; `apps/forms/src/components/field-renderer/`.

### Hide blocks, require-answer, jump and disable-completion actions

The compiler preserves their action payload but has no SSB mapping. Each action gets a specific warning. Jump blocks belong on the triggering page in the authoring model.

Evidence: Builder `forms/editor/compile.ts`, `forms/adapters/ssb/capabilities.ts`; SSB's finite behaviour union in `behavior.type.ts`.

### Arbitrary action conditions (OR, string matching, field-to-field comparisons, execution ordering)

Preserve their condition tree and actions. Only the explicitly supported subsets above are projected; the others have no runtime/export implementation. Warn at the action rather than pretending the rule can execute.

Evidence: Builder `forms/editor/compile.ts`, `forms/adapters/ssb/capabilities.ts`; SSB `behavior.type.ts`. Processor JSON Logic is not a form evaluator.

### Calculated rows and arithmetic formula actions

Saved and editable; no SSB form evaluator. Warn on the calculated row or action. Missing references and malformed formulas are validity errors using the existing formula parser.

Evidence: Builder `forms/core/formula.ts`, `forms/adapters/ssb/capabilities.ts`; SSB `behavior.type.ts`.

### Answer mentions in body content

Builder `{{field}}` tokens have no generic SSB body interpolation mapping. Warn per containing block.

Evidence: SSB `packages/form-conditions/src/confirmation-markdown.ts` supports specific confirmation tokens/segments, not arbitrary builder answer tokens.

### Imported disabled options

The schema stores `disabled`, but radio/checkbox/select renderer option mapping does not forward it. Warn “does not apply”.

Evidence: SSB `primitive.type.ts`; `apps/forms/src/components/field-renderer/{radio,checkbox,select}-field.tsx`.

### Imported hidden options / unsupported legacy settings

No faithful current SSB mapping. Source survives; warn at the source option/block.

Evidence: Builder `forms/editor/compile.ts` filtering and SSB primitive shapes.

### Unmapped widgets

Warn with the exact widget kind.

Evidence: Builder compiler's generic widget branch.

### Folded sections and other editor presentation state

These settings have no runtime effect and produce no capability warning.

Evidence: Builder NodeState / nesting.

## Warnings and recovery

Capability warnings are separate from invalid-document errors, including missing option references. The legacy adapter reports warnings against the relevant source rule. Native import/export validates the native definition; SSB compatibility is a separate concern. Markdown save/edit/download is not blocked by compatibility warnings. Migration keeps nested follow-up ancestor conditions and moves old wording variants into visible rules. Unknown legacy wording shapes fail visibly with the original draft retained, rather than being silently discarded. Static required/disabled settings, reader disclosures, repeated pages and repeated answers remain configuration. This work does not implement publishing, payment, respondent previews, or a generic SSB action evaluator.
