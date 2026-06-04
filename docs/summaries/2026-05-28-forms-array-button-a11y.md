# Array button a11y — field label exposed to assistive tech

**Branch:** `chore/migrate-forms-design-system` (follow-on to PR #259)
**Closes:** issue #316.

## What changed

In `field-renderer.tsx`, the **Add Another** and **Remove** buttons in repeatable field arrays now carry the field's label in a `govbb-visually-hidden` span:

```tsx
<button …>Add Another <span className="govbb-visually-hidden">{field.label}</span></button>
<button …>Remove <span className="govbb-visually-hidden">{field.label}</span></button>
```

Sighted users still see *"Add Another"* / *"Remove"*; screen readers announce *"Add Another Address line, button"* / *"Remove Address line, button"*. Two focused tests in `field-renderer.spec.tsx` assert the accessible name includes the field label (49 tests in that spec, full suite 647 passed / 1 skipped).

## Why the code looks the way it does

- **The session opened on issue #316, but the issue was already largely closed by PR #259.** The structural half of the WCAG fix (converting `<p onClick>` to `<button type="button">` — keyboard focus, button role, accessible name from text) landed in commit `5131263` of that PR. What remained was the field-specific part of the accessible name the issue's "Suggested resolution" calls out (`aria-label="Add another address"`, not just "Add another"). Without that, screen readers hear "Add Another, button" with no clue what's being added.

- **`govbb-visually-hidden` over `aria-label`.** Both achieve a useful accessible name. The visually-hidden span **appends** to the button's text content, preserving "Add Another" / "Remove" as the visible label; `aria-label` would **replace** the entire accessible name and decouple visible vs AT text. The span pattern is the same one used for the summary-list "Change <step title>" link (PR #259 / commit `a5b6a74`); using it twice is starting to be the project's idiom for "context that only screen readers need".

- **Folded into PR #259 rather than a separate branch.** PR #259 already touches the array buttons (their `<button>` conversion), so this completion is naturally part of the same PR. A sandbox-based branch would have had to duplicate the `<p>`→`<button>` conversion to address #316 atomically, then conflict with #259 on merge. The fix lands on sandbox when #259 merges; #316 was closed in advance (manually, since the PR doesn't target the default branch and the keyword auto-close wouldn't fire).

## Verification

- `vite build` green.
- Unit suite **28 suites, 647 passed, 1 skipped** — including the two new a11y assertions on the buttons' accessible names.
- e2e selectors not affected (the `/Add Another/i` / `/Remove/i` regex matchers still hit the visible text).
