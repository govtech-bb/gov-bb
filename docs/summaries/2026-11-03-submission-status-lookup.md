# Application status lookup for the chat

2026-11-03 · `api` submissions · #3419, #3434

## Context

The chat can show where an application has got to (govbb-chatbot#174), but
gov-bb had no way to answer "what is the status of this reference?". CaMS
statuses live in the application tracker (cms-application-tracker), not in
gov-bb. The chat side was built first, against a contract in #3350, and stays
off behind `APPLICATION_TRACKING` until this exists.

## What we did

- `GET /submissions/:reference/status` (`status/submission-status.controller.ts`)
  always answers 200 with one of `found`, `untracked` or `not_found`, or 503
  when it can't work the answer out.
- `SubmissionStatusService.lookup` decides:

  | Submission | Answer |
  |---|---|
  | No row, or no `submitted_at` (waiting on payment) | `not_found` |
  | Recipe doesn't send to CaMS | `untracked` + `receivedAt` + `formId` |
  | Recipe sends to CaMS, tracker has a record | `found` + the tracker's status |
  | Recipe sends to CaMS, tracker has no record | `found` + `received`, as of `submitted_at` |
  | Recipe deleted, tracker has a record | `found` |
  | Recipe deleted, tracker has no record | `untracked` |
  | Tracker fails in any way | 503 |

- `TrackerLookupClient` calls the tracker's `GET /status/{reference}`,
  SigV4-signed for `execute-api` in the region the API's hostname names.
  Requests to `localhost` go unsigned, for the tracker's `pnpm local:api`.
  Address: `TRACKER_LOOKUP_API_URL`.
- `POST /submissions` carries `meta.trackable` for the chat's receipt
  (govbb-chatbot#175).
- `sendsToCams(processors)` is now the one place that answers "does this form
  go to CaMS"; the confirmation email, the lookup and `trackable` all use it.

## Why we did it that way

**The decisions are Tarika's (3 Nov).** `closed` passes through unmapped: the
chat shows a status it doesn't know as "We can't show this result here", as
the tracker's own page does. A CaMS submission the tracker hasn't seen yet
really was received. A payment-pending submission hasn't reached the
department. A deleted recipe can't say whether it went to CaMS, so the
tracker decides.

**No format check on the reference.** A malformed reference takes the same
path as an unknown one, so a guess learns nothing extra. The repository reads
only `form_id` and `submitted_at`, never `values` or `meta`.

**The recipe comes from `FormDefinitionsService.findByFormId`, not the submit
path.** Found in review: `SubmissionPipelineService.resolveContract` checks for
a builder draft when the published recipe is missing, and throws a 400 if one
exists. A deleted form that was ever opened in the builder then never reached
the tracker. The lookup reads the published recipe the way the payment webhook
does for an existing submission.

**`trackable` is in `meta`, not `data`.** `data` is the stored submission;
`meta` carries facts about the request, as `deferred` and `resolvedPolyclinic`
already do. It's always true or false on a new submission. On a replay it's
worked out again, so a retry shows the same receipt, and it's left out when
the recipe no longer resolves: unknown, not false.

**A replay reads its recipe past the visibility gate.** Found end to end: a
retry of a preview-only form (how CaMS forms are tested in sandbox) lost
`trackable`, because the gate for new submissions rejected the recipe. The
submission was already accepted, so the gate doesn't apply. This also fixes
the polyclinic on such replays.

**Signing packages already in the tree.** `@smithy/signature-v4`,
`@aws-crypto/sha256-js` and `@aws-sdk/credential-provider-node` come in with
the AWS SDK clients, so nothing new is downloaded.

## Surprising consequences

- The CaMS test reads today's recipe, not the one in force at submission
  (processors aren't stored). A form connected to or disconnected from CaMS
  later is judged by its new recipe.
- In sandbox, a smoke submission to a CaMS form reports `trackable: true` and
  looks up as `found` + `received`, though nothing reached CaMS: smoke isn't
  stored on the submission.
- The global throttler (5 per 10s per IP) applies to the lookup. Every chat
  lookup comes from the chat's server, so today's limits would throttle the
  whole chat (govbb-chatbot#173).

## Open questions

- `GlobalExceptionFilter` logs the full URL of every error response, so a
  503 or 429 on this endpoint logs the reference. This endpoint's own log
  line never does. Raised as a follow-up rather than changed here, because the
  filter is shared by every endpoint.
- The signed call to the deployed tracker is untested until alpha-infra#763
  grants the API task role `execute-api:Invoke` and sets
  `TRACKER_LOOKUP_API_URL`.
