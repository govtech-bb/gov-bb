# The deploy gate rejects a required message that names no field

## Context

#2710 fixed the three Form Builder surfaces that _produce_ a generic "This
field is required" — the Required checkbox clobbering the registry's message,
the message box that didn't follow the Label, and the AI prompt teaching the
defect by example (see
[2026-09-17-required-message-names-the-field](2026-09-17-required-message-names-the-field.md)
and [0073](../decisions/0073-a-derived-authoring-default-tracks-its-source-until-overwritten.md)).
Those stop a new recipe arriving with it. None of them stops an author hand-typing
a generic string.

Item 3 — the backstop in `validateRecipeFully` — was split out as #2714 and
explicitly blocked: #2227 counted 199 such fields across 32 of the 90 recipes,
and a blocking layer shipped ahead of the cleanup would have failed Deploy for
every one of them. That blocker cleared while the split was being written:
#2712 fixed the 32 recipes and #2711 added the repo-side guard to
`pnpm validate-recipes`. The code here landed 2026-09-17; this wrap-up is the
following day.

## What we did

One commit — `74eaccb1`, against `main`. `validateRecipeFully` gains a fourth
layer beside contract parse → id collisions → unknown refs. The predicate moves
to `requiredMessageDefect` in `@govtech-bb/form-validation`;
`collectGenericRequiredMessages` lands in `packages/form-builder` beside
`collectUnknownRefs`; `scripts/required-error-guards.ts` is rewired to call the
shared predicate.

## Why we did it that way

**Two gates, not one.** #2711 already guards every recipe committed to the
trunk, so a second gate looks redundant until you ask what each one can see.
`validate-recipes` reads the committed tree and resolves against
`BUILTIN_REGISTRY`; it never sees a form built on a DB custom component, which
only exists in the builder's live catalog. `validateRecipeFully` resolves that
live catalog but never sees the committed tree. Neither is sufficient alone —
which is why the rule is enforced at both rather than picking the "primary" one.

**One definition of "generic", in the package that owns the runtime default.**
The obvious cheap version is a string comparison against
`"This field is required"` at each gate. That is two copies of a constant whose
real owner is `defaultValidationMessage` in `@govtech-bb/form-validation` — the
function that decides what the citizen actually sees when no `error` is
authored. Change the default there and a duplicated literal silently stops
matching, so the gates would pass a recipe that still ships the defect. Putting
`requiredMessageDefect` next to `defaultValidationMessage` and calling it from
both gates makes that drift impossible. This is
[0029](../decisions/0029-field-validation-rules-live-only-in-form-validation-package.md)
applied rather than a new principle, which is why this session wrote no
decision record.

**The effective message is computed, never inherited.** `validations` merge
shallow at the rule-key level (`shallowMergeDefined` via `applyFieldOverrides`),
so an override writing `required: { value: true }` _replaces_ the base rule and
discards its `error`. Reading the message as `override.required.error ??
base.required.error` therefore describes an inheritance the merge does not
perform — and it is precisely the trap #2715 fell into on its first cut, where
the new warning was blind to the nine recipes #2710 listed. Both the resolution
helper and the predicate work off the merged field only.

**`hydrateForm` shares the element resolution rather than gaining a third
copy.** The new layer needs exactly the component/block expansion the serving
path already does. Duplicating it would have put a third implementation of ref
resolution in the tree, free to drift from the one that actually serves forms —
the failure mode
[0054](../decisions/0054-recipe-override-merge-has-one-implementation.md) exists
to prevent. The refactor is the riskier half of this change (it is the live
serving path); it is covered by the expanded `resolution.spec.ts`, and a review
pass additionally proved it behaviour-preserving by running both implementations
over all 90 committed recipes and diffing the resolved steps — 0 differences.
That review also removed a ref-prefix check left behind in `hydrateForm`:
`collectUnknownRefs` has already thrown for anything `getRegistryItem` cannot
resolve, so the check could never be false, and keeping it made the two callers
of `resolveElementFields` look like they disagreed.

**A blank `required.error` is its own defect, not "missing".** Found while
moving the predicate: #2711's guard treated `""` as authored, because
`error ?? defaultValidationMessage(...)` only falls back on `undefined`. The
first cut here folded blank into `missing`, and a review pass caught that the
resulting author-facing message was then false — it promised a generic
fallback that never happens. `requiredRunner` returns the empty string as the
message, and `validate-field.ts` checks `msg !== null`, so the submission is
still blocked; the applicant just gets an error with no text. That is a
different thing to tell an author than "it falls back to a generic default",
so `RequiredMessageDefect` carries three values and each gate says the true
one. No recipe is affected today — the blank errors in the tree are all on
non-required fields — but the gate now rejects it.

**Generic wording is compared on wording, not bytes.** `"This field is
required."` with a trailing period named no field either, and exact equality
let it through both gates. The comparison now trims, lowercases and drops
trailing terminal punctuation on both sides. Nothing in the 90 committed
recipes matched the near-miss pattern, so this is hardening rather than a fix
— but the gate is the thing standing between an author and the defect, and a
period should not buy a way past it.

**`"Select an option"` (52 fields) and `"Select an answer"` (30) stay out.**
#2710 scoped them out as their own copy-standard question. Since both gates now
share one predicate, adding them here would immediately fail
`pnpm validate-recipes` on `main` for 82 fields. They need a copy standard and a
recipe fix first — and, per the paragraph above, that work belongs in
`requiredMessageDefect`, which wires it into both gates at once.

## Open questions

- The `"Select an option"` / `"Select an answer"` copy standard is unraised as
  an issue. #2710 names it as out of scope; nothing tracks it yet.
- #2710 stays open until #2227 closes — its own acceptance criteria are now all
  met, but it also carries the recipe half.
- #2227 recommends a label-aware default in
  `packages/form-validation/src/validate-field.ts`. If that lands, a _blank_
  message stops being a defect and this layer narrows to catching hand-typed
  generics. The predicate is the one place that would change.
