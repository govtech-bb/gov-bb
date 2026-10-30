# feature_flagging stops offering page toggles after cutover

2026-10-30 · `feature_flagging` · #3248

## Context

Once an environment's landing reads its pages from api_v2, landing applies the
`service_status` overlay only to its static fallback. A feature_flagging status
on a row without a form then changed nothing, and the tool still offered it and
promised a live change. The form half still works: api v1 gates the form and
landing hides Start for `form_disabled`.

## What we did

- A build-time `EDITOR_V2_URL` (feature_flagging). Unset: nothing changes. Set:
  rows without a form get no status select ("Set in content editor", or "—"
  for an orphan), a line under the row count links to the editor, and the
  confirm dialog says the status changes the form only, with a two-step
  warning on `disabled`.
- `statusEditable(row, pagesInEditor)` in `app/lib/catalogue.ts`, with spec.
- ADR 0063 amended ("After cutover"); no new ADR.

## Why we did it that way

**Retire the toggles rather than have api_v2 honour `service_status`.**
Honouring it would put a cross-service read on every page view and give a page
a second switch that bypasses the approver role (ADR 0079). The page rows are
also going away: they lose their titles once the landing markdown is removed
(#3220/#3240).

**One variable as both flag and link target.** A separate boolean would be a
second thing to set in the same cutover window. It is baked at build time like
`LANDING_URL` because Amplify Compute doesn't pass branch vars at runtime, and
the flip happens once per environment anyway. Probing landing's
`x-content-source` header at runtime was rejected: one more dependency to fail
open or closed on.

**Orphans lose the select too.** A content-only row becomes an orphan whenever
`GET /services` is empty (on failure today, for good after #3220), and an
orphan with no form is still only a page toggle.

**Form rows keep all three states.** `disabled` is the only way to unpublish a
form without a deploy until #3156. After cutover it hides the form only: api v1
maps it to `preview`, so landing drops the Start button, but the api_v2 page
stays public with no online option and no notice. Unpublishing a service is
two steps (page to Preview in editor_v2, form to `disabled` here), and the
dialog says so. The plan first claimed Start would stay and lead to a closed
form; review against `$.tsx` (`shouldHideStartLink`) corrected the copy.

**No per-row editor link.** The editor's Services list holds entries only, so
a search for a child page would come back empty.

## Open questions

- Follow-ups not yet raised: drop the content-only branch once #3220 lands;
  retire the app once #3189 and #3217 move form state to api_v2.
- What a rollback does with page rows frozen at cutover (#3225).
