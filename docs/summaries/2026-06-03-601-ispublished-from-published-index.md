# 601 — `isPublished` derived from published-index membership

## Context

A disabled, genuinely-published form that also had a newer draft was dropping
out of the Open picker entirely — no Disabled badge, no Enable button, no way to
re-enable it. Externally-authored forms (recipes added via PR, no draft rows)
were hit hardest: the first draft saved in the builder could outrank the
published version and silently flip the form out of the picker.

## What we did

- `apps/form_builder/app/server/forms.ts` — `listForms` now builds a
  `publishedIds` set from the raw `/builder/forms/published` response and ORs
  membership into each entry's final `isPublished`, before the
  `!isDisabled || isPublished` keep-filter. Replaced the stale "Known, accepted
  edge" comment that documented the dropped case as something we lived with.
- `apps/form_builder/app/server/forms.spec.ts` — two regression tests (published
  formId with a newer draft → `isPublished: true`; the disabled variant → kept,
  `isDisabled: true`), and flipped the expectation of the pre-existing
  "draft newer than published" test.

## Why we did it that way

The root cause was a semantics mismatch. `isPublished` was being set only on the
entry that *won the version merge*: when a draft's version exceeded the published
version, the draft entry won the merge with `isPublished: false`, and the
keep-filter then dropped it whenever it was also disabled. So `isPublished` meant
"the published version won the draft-vs-published race" when it should mean "this
formId appears in the published index."

The merge loop can't be the source of truth for membership because it `continue`s
(records nothing) exactly in the draft-wins case. So `publishedIds` is built
**independently** of the loop, straight from the published array, and OR'd in
afterward. The OR is genuinely necessary, not redundant with the loop — the loop
only sets `isPublished: true` when the published copy wins the version compare;
when the draft wins, the draft's own `isPublished: false` survives, and the set
membership is the only thing that recovers the truth.

This is governed by the existing principle in
`docs/decisions/0028-form-removal-semantics-split-by-publish-state.md`: a form
that is live to the public must not have its formId freed (Delete drops all
rows). Keying the picker's Delete-vs-Disable affordance off true publish-state
falls straight out of fixing `isPublished` — a published form with a newer draft
now correctly offers Disable/Enable instead of Delete. We considered writing a
new decision record for "isPublished = index membership" but judged it already
implied by 0028; this was a bug fix, not a new convention.

### Accepted UI consequences (confirmed in the plan discussion)

- A genuinely-published form with a newer draft shows the **Published** badge and
  a Disable/Enable action instead of Delete. Intended — you should not be able to
  free the formId of a form that is live to the public.
- The **Published** badge can sit on a row whose displayed version is the newer
  *draft* version. Accepted as-is; no "published vX, draft vY pending" label.

## Open questions

None.
