# landing_v2 starts as an empty TanStack Start shell on a local Nitro server

## Context

#2820 is the alternative landing_v2 spike: pages stay markdown in a database,
the API compiles them at publish time, and landing renders the compiled hast
it is handed. It runs alongside #2702 so the two can be compared on working
code. The audit on #2819 fixed the interface; the plan
`docs/plans/2820-landing-v2-rendering.md` (untracked, per the repo's plan
convention) split the landing half into four sessions. This is Session 1,
#2826: the app exists, builds, serves, and renders nothing but the v1 page
shell. The mock API and the shared contract package are a separate plan
another agent owns, and neither had landed when this session ran.

## What we did

One code commit, `300cd269`, against `v2-alt-rewrite`: 21 new files under
`apps/landing_v2/` plus the lockfile. A new nx project `landing-v2` copied
piece by piece from `apps/landing` — Vite config, root document and layout,
404 and 500 pages, header, error page, styles, public assets, `site-url.ts`
and `buildOrganizationLd`. No routes, so the root's `notFoundComponent`
answers `/` with a real 404. Gate: the project's build, test, typecheck and
lint, `pnpm lint:deps`, a frozen install, the whole-workspace build and test
run, and a curl against both the dev server and the built server on 3050.

## Why we did it that way

**Target branch is `v2-alt-rewrite`, not `v2-rewrite`.** The plan and the
sub-issues say `v2-rewrite`, which is where #2702's PRs go. The user
redirected this spike to its own branch so the two approaches never share a
history. CI runs on neither, so the local gate above is the whole gate, and
the branch is short-lived by design.

**Copy fifteen files, do not copy the app and delete.** v1 drags in the
registry, search, preview cookies, service status and thirty-odd routes the
spike excludes. Copying what v2 needs keeps the review surface to the files
that changed; deleting would have left reviewers proving absence. Every file
the plan called "verbatim" was diffed byte for byte against v1 by both
reviewers, so the shell is v1's shell, not an approximation of it.

**The Nitro preset is set in code, and the dev port is strict.** Nitro reads
`NITRO_PRESET` and `SERVER_PRESET` from the ambient environment when the
config is silent, and another app's shell may export one; an explicit
`preset: 'node-server'` makes the build deterministic. `--strictPort` on
`dev` exists because forms and landing v1 both default to 3000: a busy port
must fail loudly, not silently move the app to 3051 while a curl check reads
the wrong server.

**Links to routes v2 does not have were dropped, not kept for fidelity.** The
v1 404 page offers "Browse our service directory" and the 500 page "Contact
us"; both point at routes that will never exist here. A dead button on an
error page is worse than none, so the secondary actions went. The header's
`Services` link and the alpha banner's link stayed: those are content URLs
the API will serve once pages are seeded. Footer links lost their
`trackEvent` handlers for now because `lib/analytics.ts` is a Session 4 file
and the plan is explicit that nothing imports `@govtech-bb/analytics` before
then; the package is declared so the tsconfig path resolves.

**One `@ts-expect-error`, and it is self-expiring.** The header's
`RouterLink` adapter maps the design system's `href` onto TanStack's `Link
to`. With only `__root__` in the tree, `ParseRoute<routeTree>` is `never`,
the full search schema collapses to `never`, and `Link` demands an
unsatisfiable `search` prop for a generic `to: string`. v1 never sees this
because it has routes. The alternatives were a placeholder route (the plan
forbids one; the empty tree is what proves the shell), `createLink` (the DS
`linkComponent` is typed on `href`, so it cannot replace the adapter), or a
cast (which would survive forever). The directive was chosen because
TypeScript's unused-directive error fires the moment Session 2 adds the `$`
route, forcing its deletion; the comment says so.

**The lockfile shrank, and that is dedupe, not drift.** Adding the importer
made pnpm consolidate peer-suffix variants that already coexisted in the
lockfile (`@types/node` 24.13.3 to 24.13.6, `srvx` 0.11.17 to 0.11.22, the
`supports-color` eslint variants). No new package versions; a frozen install
and the full test run confirmed nothing else moved.

**Process.** The work ran under subagent-driven development: one implementer
on a hand-written brief (the plan uses "Session" headings the brief
extractor does not parse), a task review, then a whole-branch review. Both
reviews came back with no Critical or Important findings.

## Open questions

- `start` sets `PORT=3050` as the plan says, but Nitro reads `NITRO_PORT`
  first, so an ambient `NITRO_PORT` moves the server. Same class of risk the
  preset guard closes; `NITRO_PORT=3050` is a one-word fix if wanted.
- Nothing copies `.env.example` to `.env`, so a local build inlines
  `https://alpha.gov.bb` into the Organization JSON-LD and `og:image`.
  Cosmetic now; Session 4's canonical and OG checks will trip on it. The
  plan's Verify block needs a `cp .env.example .env` line.
- Session 2 must declare `@govtech-bb/landing-v2-contract` in
  `package.json` dependencies, not only in tsconfig `references`/`paths`:
  nx draws the `^build` edge that `typecheck` depends on from package.json.
- Two verbatim comments are ahead of the tree (`pageHead` in the root
  `head()`, `$.tsx` in `structured-data.ts`); Sessions 2 and 4 make them
  true. `prettier.config.js` fails its own `prettier --check`, inherited from
  v1 and outside the gate.
- PRs into `v2-alt-rewrite` do not auto-close issues (only the default
  branch does), so #2826 has to be closed by hand once the PR merges.
- Whether Sessions 2 to 4 ship as one PR each (the plan's shape) or as a
  single PR is still the user's call; Session 2 is blocked until the
  contract package (#2821) is at least an open PR.
