# check-import compares page content with the snapshot, after each sandbox deploy (#3710)

## Context

A deployed api_v2 database is loaded from `estate.json` only once (ADR 0129). `check-import` (#3235) already read every snapshot page with and without the preview token, but it checked only status and visibility. So a database that had fallen behind a newer snapshot still passed: sandbox lagged it on 24 pages after #3706, and nothing reported it. #3711's `sync-estate` needs a machine-readable list of those differences.

## What we did

- `src/modules/estate-drift.ts`: the pure `estateDifferences(estate, served, listed)` and the zod `Difference` (`missing` | `extra` | `field`). Its unit test is beside it.
- `scripts/check-import.ts`: the token read it already makes feeds the comparison, and one `GET /catalog` finds `extra` pages. It prints `DIFF` rows and `<n> differences in <m> pages compared`, and exits 1 on any difference. `--json` writes only `{source, differences}` to stdout.
- `e2e/check-import.spec.ts`: the clean seed has 0 differences. One drift run edits a body, deletes a page, stores a redirect over another deleted page, and inserts an extra page.
- `.github/workflows/deploy-api-v2-sandbox.yml`: a new `estate-drift` job with `needs: deploy`. `id-token: write` moved from workflow level to the `deploy` job.
- `apps/api_v2/README.md`: step 5 describes the comparison and `--json`. A new step 6 re-runs the check before each landing switch.

## Why we did it that way

- **We extended `check-import` rather than writing a second script.** It already applies the `service_status` overlay and the ancestor rule, handles the token and makes the 250 reads. Comparing the response it already has costs no page requests, and two scripts would disagree on which pages they read.
- **A job in the deploy workflow, with no nightly run.** The issue asked for a nightly run as well. `schedule` and `workflow_run` fire only for a workflow file on the default branch (`main`), which has no api_v2 until #3131, so a separate workflow would never have run before then. Drift comes from a new snapshot, which always deploys first, or from editor writes, which before cutover are only tests on sandbox. Separating the job from `deploy` keeps a deploy that worked green while drift turns the run red. It also means the check never holds the deploy role's OIDC grant: permissions are scoped per job, as in `pr-preview.yml`, rather than kept at workflow level behind a zizmor ignore. #3311 deletes the job at sandbox's cutover, because from then on the database is the source of truth.
- **No transform list.** The issue assumed the import converts StormReady's contacts. In fact the snapshot build does (`scripts/build-seed-data.ts`), and the import changes nothing but visibility. The only normalisation is how pages are served: an empty `description` is left out of the frontmatter, so `""` compares as null. `parent` has no field of its own and is read from `breadcrumbs`, after skipping the category crumbs. The e2e 0-differences run over the real seeded server, StormReady included, is what proves this mapping.
- **A transient error is never `missing`.** A 301, a 5xx or a network error stays a status `FAIL` and is left out of the comparison. Otherwise #3711 would try to create a page that exists. A deliberate break of this guard made the redirect case in the e2e test fail.
- **Draft pages get a status check only.** The preview token never sees `draft`, so their content can't be read without an editor session. The user confirmed that draft pages are being dropped, so the gap costs nothing. A page the snapshot marks draft but api_v2 serves anyway is still compared, because it is already a status failure and its content difference is real.
- **One `--json` run in the drift test, not a plain run plus a `--json` run.** A fourth full run in the file went past the site's 1,000-reads-a-minute limit. Plain mode goes through the same print call. The file's ceiling is about 165 snapshot pages (there are 125 now), and a `ponytail:` comment in the spec names the way out.

## Open questions

- For #3711: a page whose read failed (5xx or network error) isn't compared, and the JSON doesn't say so. So exit 1 with a non-empty `differences` list may be incomplete. `sync-estate` should re-run the check after syncing, or add an `unread` field. Also, `category` and `subcategory` arrive as two differences for one `category_id`.
- A malformed 200 (one with no `frontmatter` or `breadcrumbs`) makes `estateDifferences` throw with a stack trace instead of printing rows. api_v2's response schema makes this near-impossible, so it was left alone.
- #3119, #3311, #3227 and #3228 need a comment naming the job and README step 6. These are issue edits, done after the merge.
