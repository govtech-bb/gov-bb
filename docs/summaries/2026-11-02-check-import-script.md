# A script checks every snapshot page after an import (#3235)

## Context

After an estate import, README step 5 had operators run a `jq | curl` loop. It checked only the `public` pages and couldn't see the service_status overlay (#3188) or the ancestor rule. This work stacks on #3526 (#3188), which owns the overlay module this check imports.

## What we did

- `apps/api_v2/scripts/check-import.ts`, run with `pnpm --filter @govtech-bb/api-v2 check-import --base-url … --forms-api …`. `PREVIEW_SECRET` comes from the environment only.
- `e2e/check-import.spec.ts` has three cases: a seeded pass, a disabled parent with its `/start` child, and a refused or missing token. A `runScript` helper in `e2e/support.ts` shares `exitOf` with `runToExit`.
- README step 5 now runs the command instead of the loop.

## Why we did it that way

- **Import-time only, no deploy gate** (decided before the session; the issue's AC6 was dropped). CI regenerates `estate.json` on content PRs, and editors write on deployed databases, so a snapshot check only means something straight after an import.
- **`--forms-api`, not the plan's `--forms-api-url`.** It matches the import's flag, and operators run the two commands back to back.
- **The ancestor rule is inline, not `hiddenFrom`.** `hiddenFrom` takes a database `ResolvablePage`. The script needs only "the most restricted level along `parent`", which takes a few lines over the snapshot.
- **A `scripts/` file run by tsx, not part of `src/`.** It runs from the operator's checkout, never in the container, and needs no build. The e2e spawns tsx from source.
- **401 and 429 stop the run at once.** A wrong token would otherwise print a failure for every preview page. A retry after a rate limit would hide the reason.
- **Sequential requests** (~246, under the 1,000/min site limit). A `ponytail:` comment names the in-flight cap as the upgrade.

## What we almost got wrong (from dev-reviewer)

- The first case 2 disabled a root page with no children, so nothing tested the ancestor rule; deleting it left every test green. It now disables `calculate-severance-pay`, whose `/start` child has its own key, so only the ancestor rule can lower the child. A mutation run confirmed the test fails without the rule.
- Case 1 asserted per-level counts taken from each page's own level. That only holds while no snapshot page is hidden by its parent, so a content PR could turn it red. It now asserts `0 failing` per level and the overall page count.
- README step 5 used `$FORMS_API`, which is set only inside the step 3 container shell. It is now set again on the operator's machine.

## Open questions

- The `/service_status` fetch is copied from `import-estate.ts`. Once #3526 lands, move it into `service-status.ts` as one shared `fetchServiceStatuses` (not done here, so this PR stays out of #3526's files).
- Verify 5, against sandbox with the real `PREVIEW_SECRET`, is still to run. It should list exactly the 24 pages the overlay changes until #3234's re-import.
- Does the sandbox task set `PREVIEW_SECRET`? A bogus token gets a 401 either way (plan Open question 3).
