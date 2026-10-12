# One name for the Barbados National Identification (ID) number (#2732)

## Context

#2218 set the registry label to "National Identification (ID) number" for one
NHC form; the rest of the platform kept nine labels, seventeen required-error
wordings and four example numbers, and the registry's own pattern error still
said "National ID number". Picking it up, we asked the content lead which name
was final. @Fab22246 answered "Barbados National Identification (ID) number",
applied wherever a field asks for a Barbados ID.

## What we did

- `NATIONAL_ID_LABEL` in `packages/registry/src/barbados-id-patterns.ts`; the
  component label and pattern error derive from it.
- Recipe sweep in two commits (the capital-N group, then the rest), passport
  toggles after review.
- `national-id-wording.spec.ts` guards every recipe; 32 start pages and the
  docs follow.

## Why we did it that way

- **"Barbados" in the label** is the content lead's call: some services are
  open to non-citizens and offer a passport instead, so the label says which ID
  it wants. It changes the default #2218 set, so the inheriting fields move with
  one line.
- **Delete label overrides, rewrite required errors.** Overrides merge per rule:
  a recipe's `required` replaces the registry's whole rule, so deleting it ships
  "This field is required". Labels inherit; errors are restated.
- **The guard finds ID fields by format, not by ref.** Hydrated fields don't keep
  their ref. Mask, or a pattern that accepts 850101-0001 and rejects a letter or
  an extra digit — the second clause exists because the first version also
  caught a licence-number and a business-name pattern. This found three
  plain-text fields asking for the ID (school uniform, seniors, Smart Stream)
  and post-office's restated pattern, which an initial "only the error is
  overridden" reading had missed.
- **The guard checks the step, not just the field.** Review found the passport
  toggle beside the field still said "National ID number" on 11 forms: the exact
  inconsistency the issue is about, one line below the fix.
- **"Child's" only where it already was.** The issue called those deliberate;
  other third parties (deceased, co-applicant, minor) rely on the step title.
  Debated in review; left as a content decision.
- **Card mentions untouched.** "Bring your National ID card" names the document,
  not the number.

## What we almost got wrong

- Counting fields from recipe source (50) rather than after hydration hid the
  post-office restated pattern and Smart Stream's `nrn`.
- The local gate has three environment-only failures on this Mac (Node 26
  `localStorage`, a local-DB migration smoke, `scripts` `--staged` temp repos);
  each was confirmed against `main` or untouched code before being set aside.

## Open questions

- Follow-up: move the three plain-text fields onto the component (adds
  validation — a behaviour change), decide `duties-performed-exam-claim`'s "ID
  Number", and name the card consistently on upload fields and pages.
- Should third-party fields get "Co-applicant's …"-style labels? Content's call.
