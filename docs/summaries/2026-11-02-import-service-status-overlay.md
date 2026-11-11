# The estate import applies each environment's service_status (#3188)

## Context

`estate.json` takes each page's visibility from its markdown frontmatter. On live landing, though, an admin's `service_status` row in feature flagging overrides that level (ADR 0110). After cutover, landing ignores the overlay for api_v2 pages (#3125), so whatever the import stores is final. A service hidden in prod would have imported as public. This work stacks on #3523 (#3238's runbook rewrite), which left the overlay and the revision count for #3188 to document.

## What we did

- Added `content_slug` to each snapshot page and regenerated `estate.json`; the diff is the new field only.
- `src/modules/service-status.ts`: the `GET /service_status` envelope schema and `applyServiceStatuses`, landing's mapping keyed `form_id ?? content_slug`.
- `seed()` and `importEstate()` take the estate as a parameter, and `ImportReport` gains `revisions`.
- `import-estate.ts` now requires `--forms-api <origin>`. It fetches before opening the database, prints `visibility_changes` and fails closed.
- README: an "Each environment's service_status" subsection, the flag on every command, and editor-write check (b) now reads `revisions`. ADR 0129's amendment no longer waits on #3188.

## Why we did it that way

- **Fetch over HTTPS rather than read v1's table.** The api_v2 task holds only its own RDS credentials, so reading v1's table would need per-environment secrets in alpha-infra. The public, unauthenticated endpoint needs nothing.
- **A `content_slug` field, not a key derived from the url.** Feature flagging keys a form-less page by landing's hierarchical content slug. A url leaf matches today's rows except `stormready`, and would silently miss any toggle on a page filed under a subcategory.
- **The overlay runs at import, not in `build-seed-data.ts`.** The snapshot is built once and the statuses differ per environment.
- **A required flag, no opt-out, no env var.** If the statuses can't be read, guessing would import the wrong levels, so the run fails instead. A flag survives ECS Exec's unparsed `--command`, and an env var would have meant changing `config.ts`.
- **`visibility_changes` prints before the database step.** On an occupied database a plain `--dry-run` refuses, and the operator still needs the list.
- **`revisions` in the report.** A pending editor save writes no `change_events` row, so the actor histogram can't show it, and `--force` deletes it. #3234's forced re-import mustn't run without this count.
- **Docs rebased onto #3523 rather than racing it.** Both branches rewrote the same README section. We took #3523's text and added our parts back. We dropped our own ADR point 5 because #3523's Amendment already states it, and it amends there rather than in the Decision.
- **Review fixes** (dev-reviewer):
  - Step 5's smoke check now expects each page's effective level after the overlay; a lowered page and its children 404 without the token.
  - The `/start`-key wording now covers `calculate-severance-pay/start`, which has no form.
  - Fetch failures now name `service_status` and the url, with the network cause.

## What we almost got wrong

- The README claimed "a `/start` page shares its parent's row" and, separately, that every `public` page in `estate.json` returns 200. Both are true at base and false once the overlay can lower a parent. A page's effective level comes from its ancestors, not just its own row.

## Open questions

- Can the api_v2 ECS task reach v1's origin? Not yet confirmed. The sandbox dry run (#3234) is the first test.
- Prod's `--forms-api` origin: confirm it at #3230.
- #3525: pages nested under find-an-open-pharmacy only for navigation inherit its visibility in api_v2 but not on landing.
- `editor_v2:build` fails locally on a TanStack export mismatch (`_getRenderedMatches`). This branch doesn't touch editor_v2; CI will show whether it's local only.
