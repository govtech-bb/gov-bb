# Trunk-Based Development — team playbook

*How we develop with `main` as the trunk. Pairs with the "Fix promotion &
environment discipline" section of
[product-gaps-checklist.md](product-gaps-checklist.md) (the management-facing
version), the shareable diagram [branch-deploy-model.html](branch-deploy-model.html),
and the migration mechanics in [plans/go-live-handoff.md](plans/go-live-handoff.md).*

This document answers, for the team:

1. **The model** — `main` is the single source of truth; deploys roll out to the
   environments **one at a time**, each only after the previous is proven green.
2. **The merge gate** — what CI must pass before code lands on `main`.
3. **The other practices** — short-lived branches, feature flags, "stop the line."

Grounded in primary sources (trunkbaseddevelopment.com, DORA / Google State of
DevOps, Humble & Farley's *Continuous Delivery*, Fowler); citations in §7.
Where a recommendation applies a general principle to *our* nx/Amplify/ECS
stack rather than quoting a source, it's called out.

> **Status (2026-06-25):** the **merge gate is live** — `main` is the CI-gated
> trunk. The **deploy fan-out** below (sequential sandbox → staging → prod) and
> the **cutover** (making `main` the default branch) are the *target* and are
> still being built — see §6.

---

## 1. The model in one paragraph

**`main` is the trunk and single source of truth.** All work is a **short-lived
branch off `main`** — hours, merged the same day, **never more than ~2 days** —
merged back via a PR that must pass **CI** (no review required *for now* — see
§2), then deleted. Merging to `main` kicks off a **sequential deploy**:
`sandbox` deploys automatically; once that deploy is **fully green**, `staging`
deploys automatically; `prod` is a **manual, windowed** deploy once `staging` is
proven. The environments — `sandbox` / `staging` / `prod` — are **deploy
targets**, never developed or hot-fixed on directly. Incomplete work rides
`main` **behind a feature flag**, not on a long-lived branch. If `main` ever
goes red, **fixing it is the highest-priority task on the team** ("stop the
line").

```
short-lived branch ──PR (CI must pass)──▶  main  (trunk · single source of truth)
                                             │  merge kicks off the deploy sequence
                                             ▼
                                          sandbox   (auto on merge)
                                             │  once sandbox deploy is all green
                                             ▼
                                          staging   (auto, after sandbox)
                                             │  manual · release window
                                             ▼
                                           prod     (by hand, after staging proven)
```

---

## 2. The merge gate — CI only, no review (for now)

A change merges into `main` only when **CI is green**. Branch protection
(GitHub ruleset **"Main CI Required"**) enforces this: a PR is required, all
required checks must pass, and there are **no direct pushes** to `main`.

**Checks run in strict mode — the branch must be up to date with `main` before
merge.** GitHub re-evaluates the required checks against the *latest* trunk, not
against a stale base, so an out-of-date branch has to merge/rebase `main` in and
let CI re-run before it can land. This closes the gap that caused incident
#2017: two PRs that were each green in isolation broke `main` in **combination**
(#1875 added recipes with placeholder webhook env refs; #1970 added the lint
that rejects them — #1970's checks were never re-run against #1875's recipes
already on `main`). Strict mode forces that re-run at merge time. A **post-merge
`push` run on `main`** (`ci.yml`, added in #2030) is the backstop: it
re-validates the trunk after every merge — `Validate Recipes` especially, since
it checks **all** recipes, not just nx-affected ones — so a red trunk surfaces
immediately instead of on the next PR.

**No mandatory review yet.** We rely on **QA validating stability on the
environments** rather than a required reviewer; **PR review will be introduced as
the team matures**. (This is a deliberate, temporary choice — the canonical model
adds a human review gate; we'll get there.)

### What runs on a `main` PR (the commit stage)

All checks are **hermetic** — they run inside the CI runner with **no side
effects on any live environment** (no deploys, no real form submissions, no live
URLs). Required (block the merge):

| Check | What it does |
|---|---|
| **Type Check** | `sherif` dependency-consistency + `tsc -b` (whole repo compiles) |
| **Test** | `nx affected -t test` — unit tests (+ coverage, enforced in Jest) |
| **Build** | `nx affected -t build` |
| **Lint** | `nx affected -t lint` |
| **Secrets Scan** | Gitleaks (current commit + history) |
| **Security Scan** | CodeQL |
| **Validate Recipes** | recipe-file validation |
| **Run zizmor** | GitHub Actions workflow-security lint |
| **Docker Build** ×3 | builds the CD images (`api`, `form-builder-api`, `chat-ingest`), no push |

It's fast (`nx affected`-scoped + parallel) and aims to stay under ~10 minutes.

> **Not yet in the gate** (deferred — see [plans](plans/)): a runtime/boot
> check (`ssr-smoke` pattern), ephemeral-Postgres integration tests, and a
> hermetic local E2E. These catch the runtime/config failures that unit+build
> miss; they'll come with the deploy-pipeline work.

---

## 3. Sequential deploys — one environment at a time

Merging to `main` drives the environments **in sequence, not in parallel** — a
later environment deploys only once the previous one is proven green:

| Step | Environment | Trigger |
|---|---|---|
| 1 | **`sandbox`** | **auto** on every merge to `main` |
| 2 | **`staging`** | **auto**, but only **once the `sandbox` deploy is fully green** |
| 3 | **`prod`** | **manual**, in a **release window**, once `staging` is proven |

Why sequential: a broken change can't silently reach `staging` — it's blocked at
`sandbox`. (Trade-off: keeping `sandbox` deploys reliably green becomes a
prerequisite for anything reaching `staging`.) No QA approval gate for now;
`staging` triggers purely on `sandbox` going green.

**Environments are deploy targets, not workspaces.** Code only ever flows *into*
them; nobody commits to or hot-fixes on `sandbox`/`staging`/`prod`. Per-environment
differences live in **config/secrets**, never per-environment code.

---

## 4. The other industry-standard practices

### Short-lived branches
Branches exist only for review + CI before landing — *"not artifact creation or
publication."* Target **hours**, cap **~2 days**; DORA's high-performer signal
is **≤3 active branches** and **merging to trunk at least daily**.

### Feature flags / branch-by-abstraction
Incomplete or risky work is committed to `main` **turned off behind a flag** (or
introduced via branch-by-abstraction for big refactors) — this is what keeps the
trunk always-releasable without long-lived branches. **Open decision:** pick a
flag mechanism + a cleanup discipline to avoid flag debt.

### Keep the build green — "stop the line"
DORA core CI element: *"when the build breaks, fixing it should take priority
over any other work."* A red `main` (or a red `sandbox` deploy that's blocking
`staging`) is fixed first. A broken environment is a **CI/CD gap to close**,
never a fix hand-applied to the environment.

---

## 5. The per-change loop (what you actually do)

1. Pull latest `main`; cut a short-lived branch (use `-`, never `.` — Amplify
   preview certs break on a dotted branch name).
2. Keep the change small; hide unfinished parts behind a feature flag.
3. Run build + tests locally before pushing (`pnpm exec nx affected -t build test`).
4. Push, open a PR **into `main`**; wait for **CI** to go green.
5. Merge to `main` (no review required for now); branch deleted.
6. The deploy sequence runs: `sandbox` → (when green) `staging`; `prod` is a
   separate windowed/manual deploy. If anything goes red, fixing it comes first.

> **During the transition:** `main` is not the default branch *yet* and deploys
> don't flow from it *yet* (see §6). Until the cutover, the team's current
> `sandbox`-based flow still applies — this loop is the target.

---

## 6. Where we are & what's left

**Done & live:**
- `main` reset to current code; it's the trunk.
- **Merge gate enforced** — "Main CI Required" ruleset (PR + the 11 checks in §2,
  no review).
- README, this playbook, and the diagram reflect the model.

**Remaining (the deploy-pipeline work — sequence matters):**
1. **Fix `form-builder` deploys** (prerequisite — sequential `staging` is gated
   on `sandbox` going green, and `sandbox` is chronically red). Known causes:
   missing `GITHUB_ORG` on the task def (env-contract), a `@govtech-bb/git-publish`
   packaging gap, and an Express `trust proxy` setting.
2. **Wire the sequential fan-out** — `main` → `sandbox` (auto) → `staging`
   (on sandbox-green) → `prod` (manual/windowed).
3. **Consolidate the deploy workflows** onto the trunk (today `deploy-staging.yml`
   lives only on the `staging`/`prod` branches — env-branch drift) and remove the
   always-red `payload-cms` stub.
4. **Flip the default branch to `main`** + update [CLAUDE.md](../CLAUDE.md)
   ("open PRs against `sandbox`" → `main`) — **last**, once deploys flow from
   `main`.

Also pending: scope `pr-preview` / live `forms-smoke` so they don't fire on
`main` PRs (they're environment-touching and don't belong on the hermetic gate).

---

## 7. Sources

Verified primary/authoritative (adversarial fact-check: 25/25 claims confirmed,
0 refuted).

- **trunkbaseddevelopment.com** (Paul Hammant) — short-lived branches; CI before
  & after landing; feature flags; branch-by-abstraction.
- **DORA / Google State of DevOps** (dora.dev) — TBD definition (≤3 active
  branches, <1-day lifetime), daily merge; CI = TBD + fast tests; tests <10 min;
  "stop the line"; *effective suites only pass releasable code*. (Correlational,
  not proven-causal.)
- **Humble & Farley, *Continuous Delivery*** — deployment pipeline; commit stage
  (<5 min ideal / <10 max; mostly unit + a small selection of others);
  no-promotion-on-failure.
- **Martin Fowler** — *Continuous Integration*, *Feature Toggles*, *Practical
  Test Pyramid*, the "ten-minute build."
- **Google** — *Software Engineering at Google* (ch. 9 review, ch. 23 CI/CD).

*The nx-affected / Amplify-ECS / sequential-deploy mappings are our synthesis of
these principles onto our stack, not direct quotes. The "no review for now"
choice is a deliberate, temporary deviation from the canonical model.*
