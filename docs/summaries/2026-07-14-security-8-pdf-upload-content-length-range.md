# 2026-07-14 — gov-bb-security#8: enforce Content-Length-Range on PDF upload

## Context

Security issue (severity:important): the PDF-upload presigned URL signed only
Bucket/Key/ContentType via a **PUT**, so the 20 MB cap lived only in the
browser (`MAX_PDF_BYTES` in `-ai-sidebar.tsx`). A valid-session client could
skip the JS check and PUT a multi-hundred-MB PDF → Textract per-page cost
amplification + 7-day storage cost. The original design spec called for a signed
`content-length-range` condition; it was never delivered. Plan:
`docs/plans/pdf-upload-content-length-range.md`. Branch off `main`.

## What we did

- **Server** `s3-uploads.ts`: replaced `PutObjectCommand` + `getSignedUrl` with
  `createPresignedPost`, signing `["content-length-range", 0, 20971520]` and a
  content-type condition; returns `{ url, fields, s3Key }`. Added an exported
  `MAX_PDF_BYTES` constant.
- **Chain** (return-shape ripple): `presignHandler` (route) and `presignPdfUpload`
  (client server-fn) now carry `fields`.
- **Client** `-ai-sidebar.tsx`: `handleUpload` builds a `FormData` (policy fields
  first, `file` last — S3's ordering requirement) and POSTs it instead of a raw
  PUT. Dropped the `Content-Type` header (now a policy field).
- **Tests**: rewrote `s3-uploads.spec.ts` to assert the signed conditions;
  updated `-ai-sidebar.spec.tsx` mocks to return `fields` and expect
  `method: "POST"` with a `FormData` body.

## Why we did it that way

- **Presigned POST, not post-upload size check.** A presigned PUT *cannot* sign
  a size condition — that's the root of the vuln. `createPresignedPost` is the
  standard mechanism the spec named; S3 rejects the oversized body outright
  rather than us paying for the PUT and cleaning up after.
- **Kept the browser `MAX_PDF_BYTES` check** as a friendly early error; the
  server condition is the real enforcement. Comment there was rewritten — it
  previously (wrongly) implied the API already enforced the cap.

## What broke mid-build and why

- **AWS-SDK version dedup (type clash).** `createPresignedPost` lives in
  `@aws-sdk/s3-presigned-post`, which pins `@aws-sdk/client-s3@3.1085.0` exactly.
  Our top-level `client-s3` was `^3.1052.0` (resolved 3.1073), so two `S3Client`
  copies existed and `tsc` rejected passing one where the other was expected.
  Fixed by bumping `client-s3` to `^3.1085.0` so it dedupes with
  `s3-presigned-post`'s copy.
- **Removed `@aws-sdk/s3-request-presigner`** — the PUT→POST switch left it with
  no consumer in the api, so it was orphaned by this change.

## Decisions / deferrals

- **No `minimumReleaseAgeExclude` entry for the new dep.** That list holds
  security-*override* versions and workspace packages; sibling `@aws-sdk/*` deps
  aren't in it, and `pnpm install` passed the supply-chain policy without one.
  Adding one would have been inconsistent.
- **Manual S3 rejection test is pre-merge.** Confirming a >20 MB upload is
  rejected *by S3* (not just the browser) needs live AWS; can't run offline.

## Verify

`form-builder-api` build + test (285 passed, incl. new signed-condition specs);
`form-builder-app` build + test (726 passed, incl. the POST/FormData upload
path). Both pass in isolation.

## Open questions

- Issue tracked in `gov-bb-security`, fix lands in `gov-bb` — confirm how the PR
  should reference/close the security-repo issue (same as #9).
