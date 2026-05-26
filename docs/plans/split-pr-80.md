# Split PR #80 into four focused PRs

## Goal

Replace the single omnibus PR [#80 "Content fixes: chat chrome, landing nav, forms layout, Start CTAs"](https://github.com/govtech-bb/gov-bb/pull/80) with four independently-reviewable PRs against `dev`, one per concern. Preserve original commit authorship (Harry / Claude co-author) so review history and `git blame` stay intact.

## Approach

- **Parallel branches off `dev`.** The four concerns touch disjoint files (verified against the PR file list), so they can merge in any order without conflict.
- **Cherry-pick the original commits** from `content-fixes` rather than squashing or re-authoring. Mobile-collapse stays as its own commit inside the chat PR.
- **Close PR #80** with a comment linking to the four replacements once they exist.

Alternatives considered:

- *Stacked PRs* — unnecessary because there are no cross-PR code dependencies.
- *Re-target #80 to one of the four* — adds force-push churn; opening four fresh PRs is cleaner.

## Commit → PR mapping

| # | Branch | Commits (in order) | Files |
|---|---|---|---|
| 1 | `feat/chat-gov-chrome` | `1d2d2e7` feat(chat): wrap app in Government of Barbados header and footer<br>`c9b90a1` chore(chat): use Barbados Gov favicon and manifest<br>`2413908` feat(chat): compress chrome and pin composer on mobile<br>`6d190cb` chore: refresh lockfile after chat react dep addition | `apps/chat/**`, `pnpm-lock.yaml` |
| 2 | `feat/landing-primary-nav` | `3c83f46` feat(landing): add primary nav with Home, Services, Organisations | `apps/landing/src/components/Header.tsx` |
| 3 | `feat/forms-centered-column` | `a13a01f` feat(forms): constrain page content to centered column | `apps/forms/src/routes/__root.tsx`, `apps/forms/src/styles/govtech.css` |
| 4 | `fix/landing-start-ctas` | `c218ab7` fix(landing): render Start CTAs on service index pages<br>`6a3ad42` fix(landing): fully unblock Start CTAs on service index pages | `apps/landing/src/components/MarkdownContent.tsx`, `apps/landing/src/lib/rehype-hide-start-links.ts`, 11 × `apps/landing/src/content/*/index.md` |

Lockfile note: `pnpm-lock.yaml` belongs with PR 1 because the change was triggered by adding `@govtech-bb/react` to `apps/chat/package.json`. The same commit also picks up an unrelated typescript 6.0.3 → 5.9.3 consolidation; that ships in PR 1 as part of the lockfile refresh.

## Scope

For each of the four PRs:

1. `git fetch origin && git checkout -b <branch> origin/dev`
2. `git cherry-pick <commits>` in the order listed
3. `git push -u origin <branch>`
4. `gh pr create --base dev --title "<conventional title>" --body "<body>"`

PR titles (reusing the original commit headlines):

- PR 1 — `feat(chat): wrap app in gov chrome and pin composer on mobile`
- PR 2 — `feat(landing): add primary nav with Home, Services, Organisations`
- PR 3 — `feat(forms): constrain page content to centered column`
- PR 4 — `fix(landing): render Start CTAs on service index pages`

Each PR body lifts the matching bullet from the #80 description plus the relevant test-plan items.

After all four are open:

5. Comment on #80 with links to the four replacements and close it.
6. Leave the `content-fixes` branch on the remote until the splits merge, then delete.

## Verify

Per PR:

- `pnpm exec tsc -b` clean.
- Landing tests pass (PR 2, PR 4): `pnpm --filter @govtech-bb/landing test`.
- PR 1: chat dev server renders the official banner, alpha StageBanner, yellow logo bar + nav, footer on desktop; ≤md viewport collapses banners/nav/footer and pins the composer.
- PR 3: forms route renders a 720px centered column under the site header.
- PR 4: Group A page (e.g. `/business-trade/sell-goods-services-beach-park`) Apply → `forms.sandbox.alpha.gov.bb/forms/{form_id}`; Group B page (e.g. `/pensions-and-gratuities/calculate-your-pension`) Start → local `/.../form`.

Cross-PR sanity check after merges: re-run `git diff dev..origin/content-fixes` — should be empty once all four land.

## Open questions

- **Reviewers.** Same reviewer set as #80, or split by area (e.g. landing-nav + Start CTAs to whoever owns landing content)? Decide at PR-open time.
- **Merge order preference.** Technically independent, but PR 4 (Start CTAs) is a user-visible regression fix and may be worth landing first.
