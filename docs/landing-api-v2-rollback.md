# Rolling landing back from api_v2

This page says how to take an environment's landing off api_v2 and back to its static markdown, and what visitors and editors see when you do. It is the written rollback #3164 asks for (#3225). Staging tries it before prod switches (#3227).

Landing already falls back on its own, one request at a time, when api_v2 fails: it serves a kept copy (`x-content-source: api_v2-stale`) or the markdown (`static-fallback`), and its circuit breaker stops asking a failing api_v2 (`apps/landing/src/lib/api-v2-page.ts`). So an api_v2 outage does not need a rollback. Roll back when api_v2 is up but what it serves is wrong, for example pages missing or shown to the wrong people, broken content across many pages, or an editor_v2 fault nobody can fix forward in time.

## What the switch is

Landing reads api_v2 only when `VITE_API_V2_URL` is set on its Amplify branch. The build bakes the value into Nitro's `runtimeConfig` (`apps/landing/vite.config.ts`), so the switch, either way, is a change to the variable followed by a landing RELEASE build. Unset, landing serves the markdown on its deployed commit and nothing else.

alpha-infra owns the variable: it sits in the landing branch's `environment_variables` in each stack's `amplify-landing.tf`, and the Amplify module does not ignore changes to them. A change made only in the Amplify Console is put back by the next apply of that stack, and every merge to that stack's directory applies it.

Three other switches change at a cutover. Each one can be rolled back on its own, and none needs landing to roll back with it.

| Switch | Where | Rollback |
|---|---|---|
| Landing | `VITE_API_V2_URL` on the landing branch | This page |
| feature_flagging page freeze | `EDITOR_V2_URL` on the feature_flagging branch | Unset it and rebuild, as step 4 below |
| api v1 `GET /services` | `API_V2_URL` on the api v1 task (alpha-infra#801) | Unset it, apply, and deploy api v1 so the running revision drops it |
| Chat ingest | `API_V2_URL` on the ingest task (alpha-infra#802) | Unset it and rerun the ingest, which then reads the markdown |

## Steps

1. **Check the page rows in `service_status`.** Once landing reads the markdown, it applies `service_status` to pages again (ADR 0110). Those rows were kept at cutover, so they still hold the visibility pages had then. feature_flagging stopped writing page rows at cutover, but api v1's `PUT /service_status` still accepts a write from anyone who passes its GitHub-team check (#3465). List the writes made since the cutover started:

   ```sql
   SELECT slug, old_state, new_state, author, changed_at
   FROM service_status_audit_log
   WHERE changed_at >= '<cutover start>'
   ORDER BY changed_at;
   ```

   For every slug without a form (a Content or Orphan row in feature_flagging), confirm the change with its author or set it back to `old_state`. Changes to form rows are expected, because form rows stay writable until #3189.

2. **Decide what to carry over from editor_v2.** Edits made in editor_v2 since the cutover stay in api_v2's database, but the markdown doesn't have them, so the rollback hides them (see "What changes for visitors and editors" below). List them:

   ```sql
   SELECT entity_kind, entity_id, action, actor, occurred_at
   FROM change_events
   WHERE entity_kind IN ('content_page', 'category', 'collection_record')
     AND occurred_at >= '<cutover start>'
   ORDER BY occurred_at;
   ```

   Anything that must hold while landing serves the markdown needs a second change: a takedown becomes a `disabled` page row (after step 4, or with api v1's `PUT /service_status`), and wording becomes a markdown PR. In prod, a markdown PR needs `CONTENT_FREEZE` lifted first ("The markdown freeze" in the api_v2 README).

   Data-collection records have no markdown copy at all. With `VITE_API_V2_URL` unset, landing reads no collections, so the bank holiday calendar shows only the calculated statutory holidays (`resolvePublicHolidays` in `apps/landing/src/lib/public-holidays.ts`). A one-off holiday an editor added to the `public-holidays` collection (#3205) disappears. If it must stay visible during the rollback, it needs a code change in `apps/landing/src/lib/bank-holidays.ts`.

3. **Unset `VITE_API_V2_URL`.** Open an alpha-infra PR that removes the line from the environment's landing branch. Sandbox and staging apply on merge, and `@govtech-bb/platform-infra` can approve them. Prod's stack needs a CODEOWNERS approval outside that team.

   If you can't wait for a review, remove the variable in the Amplify Console (App settings, Environment variables, on the landing branch only), then open the PR straight away. Don't use `aws amplify update-branch --environment-variables`: it replaces the whole map, which would also drop `PREVIEW_SECRET` and `LANDING_SECRET`.

4. **Rebuild.** Start a RELEASE build of the landing branch. To restore page toggles in feature_flagging too, unset its `EDITOR_V2_URL` in the same PR and rebuild that branch as well. Leave feature_flagging frozen if the rollback is expected to last hours rather than days: while it is frozen, page visibility can only change through api v1 directly.

   ```sh
   aws amplify start-job --app-id <landing app id> --branch-name <branch> --job-type RELEASE --region ca-central-1 --profile <profile>
   ```

5. **Confirm landing serves the markdown.** When the build has finished, every rendered page and category listing should send `x-content-source: static`:

   ```sh
   for p in /family-birth-relationships/register-a-birth /business-trade /health-and-emergency-services/find-an-open-pharmacy; do
     curl -s -o /dev/null -D - "https://<site origin>$p" | grep -i x-content-source
   done
   ```

   The home page sends no `x-content-source`, so don't use it for this check. Every page should report `static`. A page with `api_v2` or `api_v2-stale` means the build didn't pick the change up: check the variable is gone from the branch and the build that ran is the one after the change.

   Don't use the api_v2 smoke suite (`pnpm --filter @govtech-bb/landing test:smoke --project live`, #3140) to confirm a rollback. It checks that pages came from api_v2, so on a rolled-back site every check fails by design.

6. **Record it.** On the environment's switch issue (#3311, #3227 or #3228), note the time, the alpha-infra PR, the build, the step 5 output and what step 2 carried over.

## What changes for visitors and editors

Visitors see the markdown on landing's deployed commit, with page visibility from `service_status`. In sandbox and staging the markdown keeps changing on `main` until the prod import freezes it. In prod it is frozen at the prod import (#3230), so the site goes back to the content of that day plus any PRs merged after the freeze is lifted.

Page edits, new pages, category changes and visibility changes made in editor_v2 since the cutover stop showing, and so do data-collection records such as one-off public holidays (step 2). They are not lost: they stay in api_v2's database and editor_v2 keeps working, so they come back when landing switches back. A visibility change made in editor_v2 is not written back to `service_status` (ADR 0110, "After cutover"), so step 2 is the only way it holds during the rollback.

Reviewers' preview links keep working, because the markdown path honours the same `PREVIEW_SECRET`.

## Switching back

Switching back is the cutover again: set `VITE_API_V2_URL` and rebuild landing, and set `EDITOR_V2_URL` and rebuild feature_flagging if step 4 unset it. Don't import again. After a cutover the database is the source of truth: the import refuses a database that already has content, and forcing it would overwrite editors' work (api_v2 README, "A database that already has content").

Two things can differ on the way back:

- **Markdown PRs merged during the rollback** are not in api_v2. Make the same change in editor_v2, or they disappear from the site when landing switches back. The import check (step 5 under "Per environment" in the api_v2 README) lists the differences. Don't run `sync-estate` to close them: after cutover, any difference is editors' work (api_v2 README, "Drift before cutover").
- **Page rows changed in `service_status` during the rollback** don't reach api_v2. Repeat each one in editor_v2 as a visibility change before switching back.
