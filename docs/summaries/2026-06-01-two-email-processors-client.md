# New forms seed two labelled email processors (builder client)

**Issue:** [#501](https://github.com/govtech-bb/gov-bb/issues/501)

This is the form-builder **client** half of a two-plan effort. The companion
schema/runtime half (the `label` schema field + runtime `contactDetails.email`
resolution) lives on branch `feat/501-email-schema-runtime`.

## Context

A brand-new form in the builder started with **no** email processor — the editor
showed a non-blocking "no email processor" warning and authors had to add one by
hand. The desired default is **two** email processors out of the box:

| Processor | `recipientField` | Label |
|-----------|------------------|-------|
| Applicant Email | `""` (author picks the field) | "Applicant Email" |
| MDA Email | `contactDetails.email` | "MDA Email" |

Both share the same email template; the role distinction is the configured
`recipientField` plus a **per-instance `label`**. The label is needed because the
editor previously keyed display names off processor *type*, so two email
processors would both have rendered as "Email confirmation".

## What we did

- **`-recipe-reducer.ts`** — added a `makeDefaultProcessors()` factory (mirrors
  `makeRequiredSteps()`) returning the two email drafts with fresh
  `crypto.randomUUID()` ids; seeded both `EMPTY_DRAFT.processors` and the `RESET`
  case from it. `REMOVE_PROCESSOR` still collapses an emptied list back to
  `undefined`, preserving the absent-vs-empty discipline the serializer relies on.
- **`-processors-editor.tsx`** — card header now renders
  `config.label ?? PROCESSOR_LABELS[p.type]`, so seeded emails show their role and
  an author-added email still falls back to "Email confirmation". The existing
  "no email processor" warning is kept — still correct for older forms opened
  without one.
- **`-processor-config-form.tsx`** — added a "Label" input to the email branch,
  pruned to absent when emptied (mirroring `subject`).
- Specs — reducer seeding + RESET-reseeds-with-fresh-ids; header label render +
  type-label fallback; label edit + prune.

Default subjects are placeholders ("Your application has been received" /
"New form submission received"), author-editable — no preferred copy was
specified.

## Why we did it that way

- **Direct discriminated-union literals over spreading
  `makeDefaultProcessor("email")`.** The first attempt spread the factory and
  overrode `config`. `makeDefaultProcessor` returns the wide `Processor` union, so
  spreading widened the `type` and TypeScript then checked the email-shaped
  `config` against every union member (failing on `payment`). Constructing each
  seed as a concrete `{ id, type: "email", config }` literal narrows cleanly.
- **Applicant Email seeds blank, MDA seeds `contactDetails.email`.** A new form
  has no fields yet and there's no canonical applicant-email path (recipes use
  `contact.email`, `applicant-info.email`, …), so the author fills it in; the
  server Validate flow already catches a still-blank `recipientField`. The MDA
  side has a fixed home — the reserved `contactDetails.email` namespace (see the
  companion plan's ADR 0023).
- **Label as per-instance config metadata, not a type subvariant.** Two emails
  are distinguished by `label`, keeping the processor type system flat. (Declined
  to record this as its own ADR — the schema field + editor fallback make the
  pattern self-evident.)

## Cross-branch coordination (why the history looks the way it does)

The client code can't compile without the optional `label` field on the email
config schema, which is **section A** of the companion plan. That work existed
**uncommitted** in the schema/runtime worktree. To unblock without taking over
the other plan's work, we:

1. Committed **only section A** (`processor.type.ts` + its spec) on
   `feat/501-email-schema-runtime` as `5a73e28b`, leaving its section B work
   (runtime resolution, body builder, FORM-CREATION-GUIDE) untouched.
2. Rebased this client branch onto `5a73e28b`, so both branches **share** that
   schema commit — it dedupes when whichever PR merges to `sandbox` second.

A duplicate of an already-merged docker fix (`e9f1b1a8`, a copy of
`1003a98b` already on `origin/sandbox`) was pulled in during an intermediate
rebase and then dropped with `git rebase --onto 5a73e28b e9f1b1a8`, leaving the
client branch as `origin/sandbox → section A → client`.

## Verify

- `nx run-many -t build --exclude=landing` (13 projects) and
  `nx run-many -t test` (13 projects, 625 passing) both green.
- form-builder-app suite: 228 passing in isolation.
