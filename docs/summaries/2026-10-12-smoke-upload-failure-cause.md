# Smoke upload helpers name the failing request (#2423)

## Context

#2420 took four smoke runs and a trawl through ALB access logs to find that a
`429` on `POST /files/confirm-upload` was failing uploads. The Playwright output
only said the "Remove {name}" button never appeared. #2423 asked the upload
helpers to say *which* request failed, the way `submitAndConfirm` already does
for `POST /submissions`.

## What we did

- `apps/forms/e2e/helpers/smoke.ts`: `uploadOne` and `uploadMany` both go through
  `uploadAndConfirm`, which watches presign → storage `PUT` → confirm and fails
  on the first one that goes wrong. The Remove-button wait stays as the final
  check.
- `apps/forms/e2e/upload-helpers.spec.ts`: runs the real helpers in the mocked
  e2e suite with each request forced to fail.

## Why we did it that way

- **Tested in the mocked suite, not by lowering the throttle.** The issue
  suggested verifying against a real environment with a lowered throttle. That
  needs AWS and only proves one failure mode once. Routing each endpoint to fail
  in the mocked suite covers all of them on every run. It also means `smoke.ts`
  must stay importable without a live environment, which its header now says.
- **Each request races its response against `requestfailed`.** The first
  version only waited for responses. Review caught that a dropped connection or
  a failed storage `PUT` still waited the full 30s and then blamed the wrong
  request. Only a genuine timeout becomes "No … within 30s". Anything else is
  rethrown with its cause.
- **All three watchers are armed before the file is set,** rather than arming
  confirm after presign succeeds. Arming later risks missing a fast confirm
  response, which would turn a passing upload into a false timeout.
- **The storage `PUT` is reported by status only.** Its URL carries the presigned
  signature, and S3 error bodies can echo signing details. It's matched as the
  widget's only `PUT`, which is true of `apps/forms/src/lib/api/files.ts` today.

## Open questions

- The `scanStatus === "clean"` check from the issue thread (#2839) is left to
  #2940, which adds the field. That work should extend `uploadAndConfirm`.
- If the upload widget ever makes a second `PUT`, the storage matcher needs a
  tighter predicate.
