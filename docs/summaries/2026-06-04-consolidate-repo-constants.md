# Form Builder — consolidate repo owner/name constants (#700)

## Context

Follow-up to #107. `apps/form_builder` had three independent copies of the
GitHub repo identity: `github-oauth.ts` exported display constants
(`REPO_OWNER = "govtech-bb"`, `REPO_NAME = "gov-bb"`), while
`github-recipes.ts` and `publish.ts` each carried their own `REPO_NAME` +
`repoOwner()` (env read of `GITHUB_ORG`, throw if unset), and the OAuth
callback route did a fourth inline `process.env.GITHUB_ORG` read. The owner is
env-driven everywhere *except* the access-denied page, which displayed the
hardcoded `govtech-bb/gov-bb` — a lie if `GITHUB_ORG` ever pointed elsewhere.

## What we did

- New `app/server/github-repo.ts`: `REPO_NAME` (the one genuinely fixed
  constant), `repoOwner()` (throws when `GITHUB_ORG` unset), `repoDisplay()` /
  `getRepoDisplay` (a GET `createServerFn` returning
  `{ owner: string | null, name }` — `null` instead of a throw).
- `github-oauth.ts`, `github-recipes.ts`, `publish.ts`, and the callback route
  all consume the shared module; their local copies are deleted.
- `denied.tsx` gained a route `loader` calling `getRepoDisplay` and renders
  `owner ? `${owner}/${name}` : name`.
- TDD: `github-repo.spec.ts` written first (watched fail), then the module;
  recipes spec re-pointed its `REPO_NAME` import. Commit `f805c8d2`.

## Why we did it that way

**Display degrades, action paths throw.** `repoOwner()` keeps the fail-fast
throw for publish/OAuth (a misconfigured org must not silently publish
elsewhere), but the denied page is the last place that should crash on a
config error — so the display fn returns `owner: null` and the page renders
just `gov-bb`. Alternative rejected: keeping the display constant hardcoded
(the #107 status quo) — it would keep lying under a re-pointed `GITHUB_ORG`.

**A server fn, not a direct `repoDisplay()` call in the loader.** The denied
page is reached via client-side redirect from the callback route, so a plain
loader read of `process.env` would run in the browser and always yield `null`.
`createServerFn({ method: "GET" })` (the `auth.ts` pattern) forces the read
onto the server regardless of how the route is entered.

**`userHasRepoWriteAccess` / `userIsTeamMember` keep their explicit `org`
parameter.** `github-oauth.ts` is documented as pure helpers (network I/O
only, no env reads), and the callback's single validated env read fails early
in one place. That read just became `repoOwner()` — placed *after* the
`OAUTH_REDIRECT_BASE` check so the env-error precedence
(`rawBase` → `org` → `teamSlug`) is byte-for-byte preserved.

**Verified both display branches end-to-end** against a live `vite dev`: SSR
shows `acme-org-e2e/gov-bb` with `GITHUB_ORG` set, and HTTP 200 with bare
`gov-bb` with it unset.

## Open questions

- The `null`-owner fallback renders just `gov-bb` in the denied copy; flagged
  in the PR in case it deserves different wording.
