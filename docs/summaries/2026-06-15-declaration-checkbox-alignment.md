# Declaration checkbox not vertically aligned with its label (#405)

## Context

Issue #405 reported that on the Smart Stream Vendor Registration form's final
**Declaration** step, the consent checkbox didn't line up with the first line of
its multi-line label — it floated down beside the middle of the paragraph,
making the layout look off.

The issue's cited code was **stale**: it pointed at a `[data-checkbox-option]`
wrapper styled in `apps/forms/src/styles/basic.module.css`, but both had been
refactored away. The live render path is the `field.options.length === 1` branch
of `field-renderer.tsx` (single-option / declaration checkbox), which renders the
design-system `.govbb-checkbox-item` / `.govbb-checkbox` classes. The underlying
bug was identical and unfixed: the package rule
`.govbb-checkbox-item { align-items: center }` vertically centres the (large,
3rem under the `govtechbb` theme) checkbox against the *full height* of the
multi-line consent paragraph instead of its first line. Styles had been
consolidated from `basic.module.css` into `apps/forms/src/styles/govtech.css`.

Worked on branch `worktree-405-declaration-checkbox-alignment` (targets
`sandbox`).

## What we did

- `apps/forms/src/components/field-renderer.tsx` — tagged the single-option
  checkbox row with an app class `form-page__single-checkbox` (alongside the
  package `govbb-checkbox-item`). No behaviour change.
- `apps/forms/src/styles/govtech.css` — added a scoped override: that row gets
  `align-items: flex-start`, and its label a `padding-top` of
  `calc((3rem - var(--font-size-body) * var(--line-height-body)) / 2)` so the
  checkbox's vertical centre lands on the first text line's centre.
- `apps/forms/src/components/field-renderer.spec.tsx` — class-presence tests:
  the single-option row carries `form-page__single-checkbox`; multi-option rows
  do not.

## Why it looks this way

- **App CSS, not the styles package.** The bug lives in a published-package rule
  (`@govtech-bb/styles`), but modifying that package was out of scope. The fix is
  an app-level override in `govtech.css`, consistent with the other
  package-overriding rules already there.
- **Scoped via a wrapper class, not a blanket change.** We deliberately avoided
  applying `flex-start` to *all* `.govbb-checkbox-item` — short single-line
  options look correct centred, and multi-option checkbox groups must stay
  untouched. The compound selector `.govbb-checkbox-item.form-page__single-checkbox`
  also keeps specificity above the single-class package rule regardless of
  stylesheet order, so the override wins without `!important`.
- **The offset is computed, not eyeballed.** `(checkbox height − one line box) / 2`
  resolves to exactly `9px` ((48 − 30)/2), which puts the checkbox centre dead on
  the first-line centre. Verification measured the delta at **0.0px** with the
  fix vs **60.0px** before it. The one fragility: the `3rem` checkbox height is
  hard-coded because the package exposes no token for it — noted in the CSS
  comment. If the theme ever resizes the checkbox, the offset drifts.
- **Verified against the real recipe.** Confirmed under Playwright by rendering
  the actual live Declaration step (sandbox recipe v1.2.0), seeding session-storage
  step completion (including the auto-inserted `check-your-answers` review step)
  to satisfy the step guard. Multi-option regression was checked structurally
  (compound selector + both-ways unit test + observing class-removed rows fall
  back to the original `align-items: center`), not by driving a separate
  multi-option form.
- No recipe changes or new form versions — purely a CSS/markup render fix.
