# Erase: permanently remove a published form's recipe folder via PR

## Context

Issue #599. The retire lifecycle from #576 (Delete drafts → Disable/Enable
published) had no way to permanently remove a published service's on-disk
recipe — the only route was hand-editing the repo and raising a PR. Erase
closes that gap: the inverse of Deploy. Plan: `docs/plans/599-erase-published-form.md`.

## What we did

- New `eraseRecipe` server fn in `apps/form_builder/app/server/publish.ts` —
  opens a review PR that deletes `recipes/<formId>/` via the GitHub Git Data API.
- New `-erase-modal.tsx`; an "Erase" button alongside "Disable" on live
  published rows in `-form-picker.tsx`; state/handlers in `builder/index.tsx`.
- Exported `listVersions`/`RECIPES_BASE` from `github-recipes.ts` (added an
  optional `ref` arg so the listing reads the base branch).
- Decision: [ADR 0030](../decisions/0030-erase-restricted-to-live-published-forms.md).

## Why we did it that way

- **Git Data API, not Contents API.** Erasing a folder means deleting every
  `<version>.json` under it. The Contents API deletes one file per call, each
  needing the blob SHA and producing its own commit — N commits, messy diff.
  Instead we build one tree off the base tip with each version file set to
  `sha: null` (GitHub's create-tree delete), one commit, PATCH the branch ref.
  Result: a single commit whose diff is solely the deleted folder.

- **Live-only, so there's no tombstone to clear.** ADR 0028 had anticipated
  Erase and said it "must also clear the tombstone." We deliberately did *not*
  do that — instead Erase refuses disabled forms. Clearing a tombstone is
  immediate but the recipe only disappears on PR *merge*, with no merge hook to
  coordinate them; clearing up front would leave the form live (200) while the
  recipe is still on disk, and on a disabled form re-introduce the #576 id-reuse
  poison. Restricting to live forms removes the hazard entirely rather than
  managing it. This refinement is ADR 0030.

- **Server is the authority.** The "not disabled" + "has versions" gates run in
  `eraseRecipe` before any branch is created, against `/builder/forms/disabled`
  and the version listing — mirroring Deploy's server-side `/validate` gate.
  The client buttons are gated too but bypassable.

- **Stricter validation than Disable, re-checked in the handler.** Code review
  flagged that the initial validator (`reason: z.string().default("")`) was
  weaker than the *reversible* `disableForm` (`min(1).max(2000)`). Erase is
  irreversible, so its reason — the audit trail — matters more. We tightened the
  `inputValidator` to match, then found in testing that `createServerFn`'s
  validator only runs over the RPC boundary, not on direct in-process calls, so
  we added an explicit reason guard at the top of the handler too. Belt and
  braces, and now unit-testable.

- **PR-link success state on the modal.** Modelled on `PublishModal` rather than
  `DisableModal`: Disable flips the row immediately and refetches, but Erase
  produces no visible change until the PR merges, so the user needs the PR link
  as feedback. The recipe is intentionally left in the picker until merge.

- **Distinct `.btnErase` style.** Both Disable and Erase are destructive and sit
  on the same row; Erase gets a darker, heavier red so the permanent action
  isn't mistaken for the reversible one.

## Open questions

- ADR 0028's `isPublished` weak point (#601) still applies: a disabled published
  form with a newer draft can drop out of the picker. Out of scope here; Erase
  is only reachable from the live state anyway.

## What we almost got wrong

- Early edits landed in the **main checkout** instead of the worktree (absolute
  main-repo paths while the session cwd was the worktree). Caught via a grep
  parity check, moved the files into the worktree, and restored main with
  `git checkout`. Subsequent edits used worktree-absolute paths.
- Assumed the `inputValidator` alone would enforce the non-empty reason; the
  empty-reason test proved it doesn't run on direct calls — hence the explicit
  handler guard.
