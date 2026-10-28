# One pattern for telephone questions

2026-10-05 · `registry`, recipes, `form_builder` · #2917, PR #2924

## Context

Telephone questions drifted across forms. All registry telephone components
already shared one hint, but recipes overrode it with 17 different hints and
about 45 different labels. Content agreed a single pattern on the issue: the
label "Telephone number" and the hint "For example, 421-1234 for a Barbados
number or +1 876 210 1234 for a number outside Barbados." A recipe should
override the hint only to add context the service needs, never just to give a
different example.

## What we did

- Registry: all six telephone components (`contact-telephone` included, which
  had no hint) use the agreed hint. `generic-tel` and `contact-telephone`
  default to "Telephone number". `telephone-pattern.spec.ts` pins both.
- Recipes (55 files): removed 41 hint overrides and changed 93 labels. The full
  per-field list is in the issue comment on #2917.
- `field-edit-panel.spec.tsx`: the builder's Field type picker now shows
  "Telephone number" for `generic-tel`.

## Why we did it that way

**Three label rules, not a free-for-all.**
- A label that only means "telephone number" ("Phone number", "Contact No",
  "What is your phone number?", "Main Phone") → override removed.
- A label that names a type of number ("Tel Home", "Landline number",
  "Cell / Mobile Number") → that component's default ("Home telephone",
  "Mobile telephone", "Work telephone").
- A label with real context ("Organiser's phone number", "Emergency contact
  cell number") → same wording, sentence case.

This was agreed with the user before the edit, and it covers every recipe, not
just the fields whose hints changed. We changed only labels, never the
component `ref`, even where a `components/telephone` field is labelled "Home
telephone". Changing the ref would have changed the field's validations, and
possibly its submitted shape, in a copy-only change.

**The two "We will use this to contact you… For example, (246) 249 1234."
hints were dropped too.** The sentence gave some context, but an override
replaces the whole hint. Keeping it would have meant copying the standard
example into two recipes by hand, so they drift again. The user chose to use
the default.

**`generic-tel`'s label doubles as its type name in the builder.** The Field
type picker lists the basic field types by their registry labels, so
"Telephone" became "Telephone number" next to "Text" and "Email". We kept the
new label. Reverting it would have made the six `generic-tel` fields whose
"Telephone number"/"Phone number"/"Contact number" overrides were removed fall
back to "Telephone". Every `generic-tel` use in a recipe now either sets its
own label or wants "Telephone number".

**`contact-telephone`'s default label became "Telephone number".** Its only
uses were three "Contact Number" overrides. Rather than rewrite those overrides
to "Telephone number", we changed the default and removed them, the same as
the other synonyms.

## Review follow-up (Zainab)

- **Errors have to follow labels.** A relabel isn't done until the field's
  required error matches it. The error summary uses that message as its link
  text, and the builder's `syncRequiredMessageToLabel` would have rewritten it.
  Editing the JSON by hand skipped that step, so this PR fixes 54 errors.
  `components/telephone` fields labelled "Telephone number" drop the override
  completely. A bare `{ value: true }` would replace the whole rule (validations
  merge one rule at a time in `applyFieldOverrides`) and fall back to "This
  field is required".
- **One number per box.** The `phone` rule accepts exactly one number, so the
  7 labels and hints asking for "(landline and cell)", "(s)", "one or more" or
  "at least one" were a trap. They now ask for one number, and only 2 hint
  overrides are kept. An "add another" option is a separate follow-up because
  it changes the submitted data.
- **Drift guard.** `recipe-invariants.spec.ts` fails if a telephone hint
  override contains a digit.

## Review follow-up (sajclarke)

- **Uniform errors on every telephone field, not just relabelled ones.**
  The registry `phone` message is now "Enter a valid telephone number". It
  replaces 4 different wordings, including a hotel-licence bug where the
  "required" text also showed for an invalid number. Every recipe `phone`
  override is gone. Every required error reads "{label} is required";
  `generic-tel`'s default became "Telephone number is required". The two
  caterer fields became "Caterer or cook telephone number", because "Their
  phone number is required" doesn't stand alone.
- **Blocks count.** sajclarke's list missed telephone children inside
  `blocks/*` whose label was overridden but whose error came from the
  registry. The new invariant walks block overrides too, which caught 5 more.
- **We left redundant overrides alone.** About 20 recipes restate
  "Telephone number is required" word for word. They're correct, and
  removing them would only archive more builder drafts.
- **The AI prompt had to change too.** It told the model to restate `phone`
  on `generic-tel`, which the new "no phone override" invariant would reject.

## What we almost got wrong

The first pass rewrote each recipe with `JSON.stringify` and ran prettier
afterwards. That expanded every inline array and object (`["application/pdf",
…]`, `{ "label": "Yes", "value": "yes" }`) and added hundreds of unrelated
lines. The edits were redone as minimal text edits with `jsonc-parser`
(`modify` + `applyEdits`), and each file's parsed result was compared with
the intended JSON. Any future bulk recipe edit should do the same.

## Open questions

- Merge timing: editing 55 recipes archives any open builder drafts of those
  forms (#2908). The user and sajclarke will decide when to merge.
- Smoke specs weren't walked locally. The edits are copy-only, specs fill
  fields by id, and none of the 19 affected specs checks a changed hint or
  label.
