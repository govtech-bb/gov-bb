# Feature-flagging Slack notifications: secret-backed webhook + trigger fix

**Date:** 2026-07-16
**Branch:** `feature-flagging/slack-notif` — PR against `main`.

## Context

Earlier commits on this branch wired a Slack notification to fire when an admin
changes a service's status (`setServiceStatus` → `sendSlackNotification`). Two
problems remained, both invisible to the existing tests:

1. The webhook URL was read as `process.env.SLACK_WEBHOOK_URL` but never baked
   into the bundle via vite's `define`, so on the deployed Amplify SSR Lambda
   (which doesn't pass branch env vars at runtime) it was always `undefined` —
   notifications would silently no-op in every deployed environment.
2. The trigger never fired *at all*: the API's `PUT /service_status` returned
   the **new** status, so the frontend guard `result.status !== data.status`
   compared new-against-new and was always false.

## What we did

- **Secret-backed webhook (apps/feature_flagging).** Added
  `getSlackWebhookUrl()` in `app/server/secrets.ts`, mirroring the existing
  `getSessionSecret` / `getGitHubOAuthCreds` pattern: a `process.env` direct
  override for local dev, else the `slack_webhook_url` field of the existing
  feature-flagging **tokens** secret (`FEATURE_FLAGGING_TOKENS_SECRET_ARN`).
  `app/lib/slack-notif.ts` is now `async`, resolves the URL through the getter,
  and wraps the `fetch` in try/catch. `.env.example` documents the new
  local-vs-deployed split.
- **Reliable delivery.** The call site in `setServiceStatus` now `await`s the
  notification instead of firing-and-forgetting it, so it completes before the
  Lambda handler returns.
- **Trigger fix (both apps).** `apps/api` now returns `previousStatus` on the
  PUT response via a new `ServiceStatusUpdateView` — the value was already
  computed inside `setStatus`'s transaction (`oldState`), it just wasn't
  surfaced. The frontend gates on `result.previousStatus !== result.status` and
  words the message `from ${previousStatus ?? "unset"} to ${status}`.

## Why we did it that way

- **Reuse the tokens secret, not a new one (Option A).** A Slack webhook is a
  possession credential, so it belongs in Secrets Manager — but adding a field
  to the existing tokens secret needs no new ARN, no new `define` entry, and no
  new IAM `GetSecretValue` grant (the compute role already reads that ARN). The
  trade-off (a webhook living in a secret conceptually named for auth tokens)
  was accepted over the plumbing cost of a dedicated secret. Infra follow-up to
  add the field is tracked in **#1983** (assigned to LaronGovT).
- **The getter is fail-soft, unlike its siblings.** `getSessionSecret` and the
  OAuth getter throw when unconfigured because the app can't function without
  them. Slack is non-critical, so `getSlackWebhookUrl` returns `undefined` and
  `sendSlackNotification` no-ops — a missing/empty field (e.g. before #1983
  lands) never breaks a status change. There is therefore no hard deploy
  dependency: the app ships safely and notifications start working once the
  field exists.
- **`previousStatus` comes from the API, not the frontend.** The API computes
  `oldState` atomically inside the SERIALIZABLE transaction; having the frontend
  read the current status itself would be racy and duplicate work. Adding a
  field is a backward-compatible expand, so it's safe against the shared sandbox
  API the PR previews smoke against.

## What we almost got wrong

- **The feature was completely dead and the tests didn't show it.** The existing
  `setServiceStatus` spec passed the *same* status in its mock, so the always-false
  guard was never exercised — green tests over a notification that could never
  fire. Confirming what `PUT /service_status` actually returned
  (`service-status.service.ts:82` returned `{ slug, status }`) was what surfaced
  it. New frontend tests now assert the notification fires on a real change and
  stays silent on an idempotent no-op.
- **Fire-and-forget in Lambda is unreliable.** Kept the call non-blocking at
  first (as originally discussed), then switched to `await` — background
  promises can be frozen when the Lambda handler returns, so a fire-and-forget
  POST may never send in the deployed env.

## Open questions / follow-ups

- **#1983** — infra must add `slack_webhook_url` to the tokens secret in
  sandbox/staging/prod. Fail-soft means no deploy ordering constraint.
- **Deploy-window cosmetic nuance:** if the frontend deploys ahead of the API,
  `previousStatus` is briefly `undefined`, the guard passes, and the message
  reads "from unset to X" until the API catches up. Harmless, self-healing.
- **Live smoke deferred:** end-to-end (sign in → flip a status → real webhook
  fires) needs a live Slack webhook + OAuth and a real browser per repo
  convention; verified by unit tests this session.
