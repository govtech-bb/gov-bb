# Form Builder: GitHub team-scoped login

## Context

Form Builder login was gated solely by `userHasRepoWriteAccess()` — write/admin
on `govtech-bb/gov-bb`. We wanted any member of a configured GitHub team to log
in without needing repo write access, with the access list managed in GitHub
(team membership) rather than in code.

## What we did

- Added `userIsTeamMember({ accessToken, org, teamSlug, login })` to
  `apps/form_builder/app/server/github-oauth.ts`.
- The OAuth callback (`app/routes/auth/github_.callback.tsx`) now gates on
  `userIsTeamMember(...) || userHasRepoWriteAccess(...)`, team-first.
- `userHasRepoWriteAccess` gained an `org` arg; the hardcoded
  `REPO_OWNER = "govtech-bb"` was replaced by reads of `process.env.GITHUB_ORG`
  in `github-oauth.ts`, `publish.ts`, and `github-recipes.ts`.
- OAuth scope gained `read:org` (`app/routes/auth/github.tsx`).
- New env vars `GITHUB_ORG` / `GITHUB_TEAM_SLUG` wired through both
  `.env.example` files (root + `apps/form_builder/`) and `docker-compose.yml`.
  The Amplify console step is manual / out of repo.
- Tests extended: new `userIsTeamMember` cases, `org` threaded through the
  existing specs (form-builder 116 → 122 tests).

## Why we did it that way

The access-model principle is recorded in
[0011 — Form Builder access is delegated to GitHub identity](../decisions/0011-form-builder-access-delegated-to-github.md);
the points below are the session-specific reasoning behind it.

- **OR, not replace.** Keeping the repo-write check means existing collaborators
  stay unblocked during and after cutover — no need to migrate everyone onto the
  team first. The team check runs first and short-circuits.
- **Slug supplied directly via env, not slugified in code.** GitHub's real team
  slug can differ from naive slugification of a display name, so the env var
  holds the canonical slug (the URL segment, e.g. `form-authors`), and we never
  guess it.
- **`read:org` is required.** `GET /orgs/{org}/teams/{slug}/memberships/{user}`
  returns 403 without it; our helper reads 403 as "not a member", so without the
  scope real team members would be wrongly denied. The existing `repo` scope
  stays — the token is reused by `publish.ts` to commit recipes / open PRs.
- **`pending` ≠ access.** Membership grants access only on
  `state === "active"`, so an unaccepted invite does not let someone in.
- **Org promoted to env var.** The team and the repo live in the same org, so a
  single `GITHUB_ORG` replaces every hardcoded owner. The repo *name* stays
  hardcoded (out of scope).
- **Team-API errors throw, deliberately.** `userIsTeamMember` throws on
  unexpected (non-403/404) statuses, matching the existing repo-check contract.
  Because it is the left operand of `||`, a transient team-API 5xx aborts login
  before the repo fallback runs — so a team-API outage can block repo
  collaborators who would otherwise pass. We chose fail-loud (surface real
  errors) over swallowing to `false`; revisit only if team-API flakiness proves
  real in practice.

## What we almost got wrong

- **Two `.env.example` files exist** — the root one (paired with
  `docker-compose.yml`) and `apps/form_builder/.env.example`. The first pass only
  updated form_builder's; review caught that compose consumers read the *root*
  file, so both now document the vars.
- **Generated-file churn.** A full `nx build`/`test` makes the TanStack Router
  codegen rewrite `apps/forms/src/routeTree.gen.ts` in its raw (unprettied)
  style, producing a spurious ~80-line diff. Reverted; recorded so it doesn't
  puzzle the next person.

## Open questions

None. The Amplify env-var setup and the live-login smoke test (real GitHub team,
real browser) are manual follow-ups owned by Isaiah, not unresolved design
questions.
