# Branch names fit the 63-char Amplify preview label

## Context

#2488: Amplify names each PR preview host after the branch with `/` → `-`, and
a DNS label is capped at 63 characters. Four builder-generated PRs on
2026-08-25 had 64–68-character names, so their preview host never resolved and
the A11y scan and forms smoke gate failed with `ERR_NAME_NOT_RESOLVED` —
read as flaky, and two PRs merged with both gates red. The issue proposed a
fail-fast guard beside the existing dotted-branch guard, and floated a shorter
timestamp or dropping the `-index` infix for the generators.

## What we did

Three commits on `worktree-fix-2488-branch-name-length-guard` (two code, one
docs), against `main`.

- **Guard, two places** — `pr-preview.yml` "Guard branch name" and
  `.claude/hooks/block-dotted-branch.sh` reject a name whose `/`→`-` label
  exceeds 63, mirroring how the `.` rule is enforced.
- **`fitBranchSegment`** in `packages/form-types/src/deploy-branch.ts`:
  unchanged when the name fits, otherwise truncate + `-<6-char FNV-1a hash of
the full segment>`. Wired into `deployBranchName` / `deployBranchPrefix` /
  `eraseBranchName` and both `start-page-…` sites in
  `apps/form_builder/app/server/content.ts`.
- **`deployBranchLabel(formId)`** — the segment a form's branch actually
  carries. The Deploy-PR reuse check in `publish.ts` and the client-side
  "In review" map in `use-forms-list.ts` both join with
  `formIdFromDeployBranch(headRef) === deployBranchLabel(formId)`.
- CLAUDE.md gains a sibling section under "Never put a `.` in a branch name".

## Why we did it that way

**A shorter timestamp could not have fixed it.** The issue framed the problem
as "any form id over ~36 characters", which reads like a tail case. Measured
against the repo, the longest recipe id is 84 characters
(`apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026`,
a 111-character branch) and the longest content slug is 78 (a 103-character
branch); 21 of 90 recipe ids and 53 of 116 content slugs exceed their budget.
Base-36 or seconds-since-epoch saves 5–7 characters against a 48-character
overshoot and would have broken the `\d+` tail both parsers rely on. Truncation
was unavoidable; the only question was how the reverse lookups survive it.

**Guard-only would have been a worse outcome than the bug.** The pr-preview
jobs are not in the "Main CI Required" ruleset (Build, Test, Type Check, Lint,
Secrets/Security Scan, Validate Recipes, zizmor, Docker builds are), so a guard
alone turns a silent dead preview into a loud, non-blocking red X on every
long-id publish — legible, but still merged, and the generator still cannot
produce a working name. Both halves had to land together.

**Hash, not plain truncation, and the hash is of the full segment.** Two long
ids sharing a 29-character head must not land on one branch, and the fitting
must be a pure function so a parser can regenerate it from the same id or path
(`exactContentBranch` does exactly that). FNV-1a → base36 is dependency-free
and browser-safe, which matters because `@govtech-bb/form-types` is imported by
client components.

**The join compares labels through the existing candidate-free parser.** The
first cut added `deployBranchMatchesFormId(headRef, formId)` — fitted prefix +
all-digit tail. It was correct for the sibling case, but ADR 0070 (the #2390
record) requires the parser to take no candidate id, and the reviewer found two
real holes: `eraseBranchName("passport")` and `deployBranchName("erase-passport")`
are the same string, so the matcher would push a recipe onto an Erase PR; and
the truncated label was not "display-only" as I had claimed — `pr.formId` is a
Map key that `form-picker.tsx` and `services.tsx` look up by the real id, so
the "In review" badge and filter silently vanished for the 21 long-id forms.
Reverting to `formIdFromDeployBranch(headRef) === deployBranchLabel(formId)`
fixes both for free (the parser already returns `null` for the erase
namespace) and needs one exported one-liner instead of a new matcher. The
client hook re-keys the map by the real form id, so the two consumers stay
untouched; that is safe because `services` is built from `forms.forms` itself.

**No legacy matching for old-style long branches.** Zero `start-page-*` or
`form-builder/*` PRs were open at the time, so nothing is orphaned by the
rename. The window is really "until each environment's builder redeploys" —
prod is manual — and a raw long-named PR open at that moment degrades to a
duplicate Deploy PR or a content page that is read-only in the builder until
it closes (the pre-#2390 behaviour, not data loss). We chose to re-check
`gh pr list` before merging over carrying two permanent code paths for a
transient window.

**No guard on `fitBranchSegment` for a prefix ≥ 42.** Both prefixes are
literal constants far under it; CLAUDE.md says not to handle impossible
scenarios. It is exported, so the next caller gets no signal — noted, accepted.

**No decision record.** Proposed (`generated-branch-names-carry-a-fitted-label-not-the-id`,
amending 0070's "recovers the id" premise) and declined; the CLAUDE.md section
and the doc comments on `deployBranchLabel` / `formIdFromDeployBranch` carry
the rule.

**Hook filename kept.** `block-dotted-branch.sh` now enforces two rules, but
`settings.json`, CLAUDE.md and two sibling hooks reference it by name.

## What we almost got wrong

- **"Display-only" was wrong.** I presented the truncated round-trip as an
  accepted cosmetic degradation. Nothing renders `pr.formId`; it is a join key.
  Code review caught it — the lesson is to trace every consumer of a value
  before calling a semantic change cosmetic.
- **The first test for the hyphen trim had the wrong budget** (forgot the
  14-char timestamp suffix); the implementation was right.
- **`local name="$1" label="${name//\//-}"` on one line** fails under `set -u`
  because expansions run before `local` assigns — and a crashing hook
  fail-opens to _allow_. Caught by exercising the hook with real payloads.
- **`content.spec.ts`'s fixture branch is now computed from `fitBranchSegment`**
  (its 47-char slug is over budget). The spec and implementation move together;
  the independent pin lives only in `deploy-branch.spec.ts`.

## Open questions

- `formIdFromDeployBranch` and `OpenDeployPR.formId` are now misnomers — both
  hold the label. Renaming ripples into ADR 0070's text and several specs;
  left with doc comments instead.
- ADR 0070's "a parser that recovers the id" is slightly stale; no amendment
  written by decision.
- Re-run `gh pr list --state open` for `start-page-*` / `form-builder/*` heads
  immediately before merging; the pre-merge check stands in for legacy code.
