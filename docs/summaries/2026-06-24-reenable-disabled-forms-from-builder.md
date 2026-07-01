# Re-enable disabled forms from the builder picker

**Date:** 2026-06-24
**Branch:** `reenable-disabled-forms-1658`
**Issue:** [#1658](https://github.com/govtech-bb/gov-bb/issues/1658)

## Context

Once a form was disabled from the builder, there was often no UI path back: it
vanished from the "Open Form" picker, and clearing its `form_disabled_overrides`
row required direct DB access. The backend enable path (`DELETE
/builder/forms/:formId/disabled`) already worked and was untouched — the bug was
entirely in the form-builder frontend.

Two trapped states:

- **B** — disabled but still has a draft (or published) row. In the list, but
  dropped by a filter / would render the wrong button.
- **A** — disabled with *no* draft and *no* published recipe (e.g. the recipe
  was erased out-of-band). Never entered `listForms` at all.

## What we did

- **`listForms` (`server/forms.ts`)** — dropped the trailing
  `.filter(f => !f.isDisabled || f.isPublished)` (closes B), and seeded a
  synthetic row (`title: formId`, `version: ""`) for any disabled `formId` not
  already present, treating `/builder/forms/disabled` as authoritative (closes
  A). Added an `isOrphanOverride` flag = `disabled && !draft && !published`.
- **`-form-picker.tsx`** — reordered the per-row action so `isDisabled → Enable`
  wins over `!isPublished → Delete`. Orphan rows are Enable-only: no Duplicate,
  no version badge, and not row-clickable (there's no recipe to open).
- **`BuilderFormSummary` (`packages/form-types`)** — added `isOrphanOverride?:
  boolean`. (The builder's `types/index.ts` re-exports this type after the #1403
  split relocated it from a local `FormDefinitionSummary` into the shared
  package; the flag was moved here when rebasing onto that change.)
- **Review-driven follow-ups** (caught by a code-review pass before commit):
  - **Content-screen leak** — `listForms` also feeds `content/index.tsx` and
    `content/edit.tsx`. The filter we removed was de-facto protecting them, so
    disabled-draft/orphan rows started leaking in. Restored their prior behaviour
    by routing both loaders through a new pure `linkableForms` helper in
    `content/-lib.ts` (`!isDisabled || isPublished`), unit-tested in `-lib.spec.ts`.
  - **Stale API comment** — the `form_builder_api` rekey handler claimed
    rekey-while-disabled was "unreachable… listForms drops disabled-and-
    unpublished drafts." That's now false; updated the comment (no behaviour
    change).

## Why it looks this way

- **Inline orphan rows, not a separate "Disabled" section.** The picker already
  had an inline Disabled-badge + Enable pattern for disabled-*published* forms;
  extending it to all disabled forms (including synthetic orphans) was less code
  and no new visual concept than a dedicated section.
- **`listForms` stays the authoritative superset; consumers filter.** Rather
  than making the picker fetch a different list, `listForms` returns every
  disabled form (the picker's recovery surface) and the content screens filter
  down to *linkable* forms. The regression taught us the removed filter was
  implicitly serving three callers — `linkableForms` makes that visibility an
  explicit, testable per-screen decision. Considered an ADR for this; it's an
  instance worth a code comment, not a new principle, so none was written.
- **Orphan rows are deliberately Enable-only and non-openable.** A true orphan
  has no recipe to load, name, or copy — so Duplicate, open-on-click, and the
  `v` version badge are all suppressed. Title falls back to the bare `formId`.
- **Enabling a true orphan makes it disappear** (no draft, no published, no
  override left). Accepted: the `formId` is freed for reuse, matching the issue's
  intent.

## What we almost got wrong

The first cut of the fix passed its own tests and build green, and *looked*
done. A pre-commit code-review pass found that `listForms` has two consumers
beyond the picker — the content CMS list and the form-link combobox — that the
old filter had been silently protecting. Without the `linkableForms` fix, every
disabled/orphan form would have shown up as a creatable content "service" and a
linkable target. The lesson: when removing a filter from a shared data source,
check every caller, not just the one you're changing.

## Open questions

None. Manual browser smoke (disable a draft-only form → Enable from the picker →
returns to an editable draft) is the remaining human verification.
