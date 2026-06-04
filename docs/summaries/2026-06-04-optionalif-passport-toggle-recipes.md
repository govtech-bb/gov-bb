# 2026-06-04 — optionalIf on National ID fields behind passport toggles (#761)

## Context

Every form with a "Use passport number instead" show-hide toggle had an
incomplete flow: the toggle revealed the passport field, but the National ID
field stayed unconditionally required, so a citizen without a National ID
could never submit. The `optionalIf` behaviour (relaxes `required` without
hiding) already existed end-to-end — schema, server evaluator, client
validation builder — but no recipe used it. This session wired it into the
recipes, taught the form-builder AI prompt the pattern, and added a regression
invariant.

## What we did

- `optionalIf` (targeting the toggle, `equal`/`true`) on 16 required National
  ID fields across 11 recipes, edited in place — see ADR 0035 for the
  no-version-bump policy.
- Renamed `post-office-redirection-individual`'s toggle
  `passport-number` → `passport-toggle` (every other recipe's name; also
  collided conceptually with the real passport input).
- New invariant in `recipe-invariants.spec.ts`: latest version of each recipe,
  a required `components/national-id-number` sharing a step with a
  passport-mentioning show-hide must carry `optionalIf` targeting it.
- System prompt: an `optionalIf` section beside the `fieldConditionalOn` one,
  plus an "Alternative Identity Pattern" guardrail (toggle +
  `fieldConditionalOn` on revealed field + `optionalIf` on replaced field).
  Sentinel assertions in `system-prompt.spec.ts`.

## Why we did it that way

- **In-place edits over version bumps** — the central call; recorded as ADR
  0035 rather than restated here.
- **The invariant is wording-scoped on purpose.** It keys passport toggles off
  "passport" in label/hint, step-scoped. Reviewer suggested also matching
  steps containing a `components/passport-number` input (robust to rewording);
  the user chose to ship the simpler heuristic since every current recipe
  satisfies it. If a future toggle says "travel document", extend the test.
- **Recipe edits were scripted, not hand-edited.** A `json.load`/`json.dumps`
  round-trip with `indent=2, ensure_ascii=False` is byte-identical to the
  committed formatting, so a Python script applied all 16 edits with
  assertions (exactly one field matched per edit, no pre-existing optionalIf)
  — eliminating 16 chances of a typo'd `targetFieldId`.
- **TDD both halves**: the invariant was written first and failed on exactly
  the expected fields; the prompt sentinels were written first and failed
  before the prompt sections existed.
- **The invariant paid off in-session.** Merging origin/sandbox (the worktree
  base was 62 commits stale) brought a *new* passport toggle into
  `temp-teacher-application-barbados/1.3.0.json` — the invariant caught the
  missing optionalIf immediately, turning what would have been a silent
  regression of the exact bug into a one-line fix. Field count became 16
  across 11 recipes (the plan said "16 across 10", which was itself a
  miscount of its own 15-row table; the merge coincidentally made the 16
  true).
- **Verification was programmatic, not dev-server.** A live run was blocked
  (docker socket unavailable; the worktree's vite proxy targets a deployed API
  that wouldn't have local recipe edits). Instead a scratch spec (deleted
  after) pushed the real edited recipes through the real pipeline —
  `hydrateForm` → `mapContractToLocale` → `buildFieldValidationProperties` —
  asserting untoggled = required error, toggled = passes, toggled+malformed =
  pattern still fires, for every edited field. Gotcha for repeating this:
  `@govtech-bb/registry`'s `main` points at `./src/index.js` which only exists
  in built output, so jest needs a `moduleNameMapper`-style mock
  (`jest.mock(..., {virtual: true})` worked).

## Open questions

None. The only deferred item is the invariant's wording-heuristic
future-proofing, deliberately declined above.
