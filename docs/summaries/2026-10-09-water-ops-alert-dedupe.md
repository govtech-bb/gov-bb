# De-duplicate water-alert ops emails (#2970)

## Context

The water-alert checker (`CheckerService.scheduled`, every 30 minutes) emailed
ops on every failed run with no memory of having done so: 40+ identical emails
during #2969. The issue asked for alert-once / remind / recover-once, and left
open where the "already alerted" state should live.

## What we did

- `water_ops_alerts` table (migration `CreateWaterOpsAlerts1791536637000`) and
  `WaterOpsAlertRepository`: each send decision is one atomic statement.
- `OpsAlertService`: email wording, 6-hour reminder, in-memory fallback,
  retry for skipped notices. The checker only reports outcomes.
- Skipped feed notices reach the checker through `fetchOutagesWithSkips()`;
  the public feed shape is unchanged.
- Rationale and trade-offs are in `docs/water-alerts.md` ("Ops alerts").

## Why we did it that way

- **Postgres, not CloudWatch.** The repo has no infrastructure-as-code, so an
  alarm would be configured by hand outside review. The water tables already
  come from a `packages/database` migration that runs on startup.
- **The decision is the write.** Several API tasks can report the same failure.
  A read-then-send would let two tasks both email, so each decision is a
  single upsert or update whose returned row says "you send".
- **The send-failure email was included** although the issue only named the
  crash email: it floods the same way. Agreed at triage.
- **The interval is 6 hours** (the issue suggested 6–12); the user chose 6.
- **Public feed untouched.** `GET /water-alerts/outages` returns the feed object
  as-is, so adding skipped notices to it would publish internal validation
  reasons. The checker gets them through a separate method instead.
- **Existing helpers reused.** `reason(err)` from `feed.service.ts` leads the
  crash email; the table follows the uuid-id `CreatedEntity` convention.

## What we almost got wrong

- **Flapping.** The first version cleared `failing_since` on recovery, so a
  failure that alternated fail/recover counted as new every time: about 48
  emails a day again. Both my own review and the independent reviewer caught
  it. Now a signal is emailed at most once per 6 hours, and "recovered" only
  follows a failure that was actually alerted. On real Postgres a 7-hour
  flapping trace went from 14 emails to 4.
- **False "sends recovered".** A run that sent nothing (`attempted: 0`) recovered
  `send-failures`. Recovery now needs a run that actually sent.
- **Skipped-notice keys.** Keying on the display ref (clipped, `"(no ID)"` for
  ID-less notices) collapsed different notices into one. Keys are now a sha256
  of the full guid/link, or of the item.
- **Lost one-off alerts.** A skipped notice is claimed before its email; a failed
  email left it claimed forever. Failed sends now release their claims.
- **TypeORM shape.** `manager.query` returns `[rows, rowCount]` for UPDATE on
  Postgres (`PostgresQueryRunner.js`). Reading it as rows would have reported
  "recovered" every run; the spec pins the shape.
- **Mocked SQL proves little.** The repository specs only assert SQL text, so
  every statement was also run against a throwaway Postgres 16 container (SQL
  extracted from the source file, including concurrent sessions). The mocks
  alone would never have shown the flapping problem.

## Open questions

- A "recovered" email that fails to send is lost (accepted, documented).
- `skipped-notice:*` rows are never pruned; bounded by distinct bad notices.
- A failed advisory unlock after a successful run still reports a crash. That
  predates this work.
