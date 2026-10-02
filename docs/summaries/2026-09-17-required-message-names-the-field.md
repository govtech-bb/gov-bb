# The required error message follows the field's label

## Context

#2227 counted 199 required fields across 32 of the 90 recipes whose error
message is "This field is required" — a sentence naming no field. The forms
error summary uses the message verbatim as its link text
(`apps/forms/src/components/error-summary.tsx`), so a step with three blank
required fields renders three identical links. #2227 fixes the recipes; #2710
is the other half — nothing in the authoring tool stopped the 33rd recipe
arriving the same way. Recipe cleanup was running in parallel in another
session while this work went on.

## What we did

One commit against `main`: items 1, 2 and 4 of #2710. New pure module
`apps/form_builder/app/components/builder/required-message.ts` holding the two
decisions (what the Required checkbox writes, when a label edit may rewrite the
message), wired into `field-edit-panel.tsx`; the AI system prompt's examples
and `form-design/SKILL.md` updated. Item 3, the `validateRecipeFully` gate, is
split out as #2714.

## Why we did it that way

**The message is persisted, not merely displayed.** The alternative was to show
a derived message in the editor and let the shared validator compose a
label-aware default at runtime — which is what #2227 _recommends_ for
`packages/form-validation/src/validate-field.ts`. But the work actually in
flight on #2227 is recipe-string edits, not the validator change, so a
display-only fix would have left the generic message shipping. Persisting
`"{Label} is required"` into `validations.required.error` is correct whether or
not that validator default ever lands; if it does, this just stops being the
only thing standing between an author and a bad message.

**Re-derivation is decided by recomputing, not by a flag.** The editor needs to
know whether the current message is "auto" (safe to rewrite on a rename) or
authored (must never be touched). The obvious implementation is a boolean
stored beside the value — but recipes are the published contract, and a flag
would leak authoring state into them. Instead the predicate recomputes
`"{previous label} is required"` and compares. That is stateless, so it still
behaves correctly after the panel is closed and reopened, and it has a useful
accident: the registry's own messages are written in that shape
(`components/email` ships "Email address is required" against the label "Email
address"), so an inherited message tracks a rename, while genuinely bespoke
copy like "Enter your employer's name" does not. The cost is that an author who
hand-types exactly `"{Label} is required"` will see it re-derived on the next
rename — which produces the same string they wanted anyway.

**The placeholder shows the merge's answer, not the base's message.** The
issue's complaint about surface 2 is that the placeholder rendered the sentinel
as if it were a sensible default. The fix is _not_ to show the derived message
there — that would be the same lie in a better costume, since an empty box
really does fall back to whatever the merge resolves. What the merge resolves
is the subtle part: `shallowMergeDefined` merges `validations` at the _rule_
level, so the moment a field carries a `required` rule of its own, the base's
entire object — message included — is gone. `effectiveRequiredMessage` is the
one place that models this, and the placeholder, the generic-message warning
and the sync predicate all read from it.

**Ticking Required can now delete the override.** Where the base already
requires the field and ships a usable message, `requiredRuleOnTick` returns
`undefined` and the key is dropped. Writing a copy of the base message would
work, but it goes stale the moment the registry changes its wording, and the
merge makes inheritance the truthful state.

**The gate was deferred deliberately.** `validateRecipeFully` returns
`{ok: true, data} | {ok: false, issues}` — there is no warning channel, so
"warn, don't block" needs new plumbing through the Deploy path, and a blocking
layer would fail Deploy for all 32 recipes on the #2227 list until that work
merges. See #2714.

## What we almost got wrong

**The first cut of the warning was blind to the fields the issue is about.** It
computed the effective message key by key —
`override.required.error ?? base.required.error` — which is an inheritance the
merge does not perform. For a field carrying `required: { value: true }` over a
base shipping "Email address is required" (the exact state the clobber left 9
live recipes in), the applicant sees the sentinel while the editor showed the
base's message as the placeholder and no warning at all. The sync predicate
read the same way, so for four of those nine a rename couldn't fix it either.
Code review caught it; `effectiveRequiredMessage` and two panel specs are the
fix. The lesson is narrow and worth keeping: **when reasoning about a resolved
field, model the rule-level replacement, not a per-key fallback** — the same
trap the original clobber fell into, one level up.

The generic-message warning first shipped with `role="status"`, which broke
`step-editor.spec.tsx` — that spec does `within(dialog).getByRole("status")`,
and the field editor dialog then contained two status nodes. It is plain
advisory text now. Worth remembering for anything else added inside that
dialog.

Two pre-existing specs in `field-edit-panel.spec.tsx` changed meaning rather
than breaking: one asserted the bare `{ value: true }` that _was_ the defect,
and the hand-typed-message spec had to clear the box first now that ticking
Required seeds one.

## Open questions

- Question-shaped labels derive badly: "Do you have any endorsements?" becomes
  "Do you have any endorsements? is required". Left as-is — the author can
  override, and the `"Select an option"` / `"Select an answer"` copy standard
  (82 fields between them) is explicitly out of scope in #2710 and wants its
  own issue.
- Whether `"Select an option"` and `"Select an answer"` count as generic for
  the #2714 gate is unresolved, and decides how much that gate catches.
