# Form-builder PDF → Textract converter — design

**Date:** 2026-06-09
**Branch:** `feat/form-builder-pdf-textract-converter` (off `sandbox`)
**Related:** supersedes the inline-base64 PDF path established in `2026-05-21-form-builder-pdf-upload-hardening-design.md`.

## Problem

The form-builder AI sidebar accepts a PDF upload and converts it into a form recipe via Claude (Bedrock). The current path is **client base64 → TanStack Start server fn → `form_builder_api` → Bedrock `ConverseCommand` with a `document` block**. Two problems:

1. **Hard 4 MB ceiling.** PDFs are base64-encoded inside a JSON server-fn body. The Amplify SSR Lambda caps requests at ~6 MB; the client guards uploads at 4 MB raw to stay under that after base64 inflation. Above 4 MB, the client surfaces a generic "Invariant failed" 413, which TanStack Start strips of detail. Users with larger forms can't use the feature at all.
2. **Expensive AI step.** PDFs sent as Bedrock `document` blocks are rasterized and consume ~1–2k input tokens per page. For a typical multi-page government form this is meaningfully more cost and latency than feeding the model an equivalent text extraction.

## Goals

- Lift the upload ceiling to **20 MB**.
- Eliminate the cryptic "Invariant failed" 413 mode.
- Make the AI step measurably faster and cheaper on the same input by feeding extracted text instead of raw PDF bytes.
- Handle both born-digital and scanned PDFs (mixed user input).

## Non-goals

- Lifting beyond 20 MB. Textract's async API supports up to 500 MB; we are explicitly scoping to 20 MB and leaving headroom in the architecture for later.
- Persisting upload state across sessions. The `jobId` is the client's only handle on the work; if they refresh, they re-upload.
- LocalStack-based integration tests in CI. Manual smoke is the gate for sandbox; revisit if the manual smoke catches real bugs we'd want CI to catch.
- Changing the recipe-generation prompt itself. The model's input format changes (text instead of PDF document blocks); the system prompt does not.

## Approach

Replace the single inline path with a three-step async flow:

1. **Browser → S3** via presigned PUT URL (bypasses the Amplify Lambda body cap).
2. **AWS Textract `AnalyzeDocument` (async)** with `FORMS` + `TABLES` features. The API server starts the job and returns a `jobId`; the client polls for status every ~2 s.
3. **On Textract success**, the polling handler converts Textract's block graph into a compact text representation and feeds *that* (not the PDF) to Bedrock. Claude returns a recipe as today.

Textract was chosen over open-source `pdf-parse` + `tesseract.js` because user PDFs are a mix of born-digital and scanned originals — Textract's built-in OCR plus its `FORMS` feature gives structured field/key-value/checkbox detection that significantly improves recipe quality on scanned input, where a plain markdown dump would collapse the structure entirely.

## Architecture

```
Browser ──(1) GET presigned PUT URL ────► form_builder (SSR)
Browser ──(2) PUT raw PDF ──────────────► S3 (sandbox uploads bucket)
Browser ──(3) POST {s3Key} ─────────────► /builder/ai/upload/process
                                            └─► Textract.StartDocumentAnalysis(FORMS+TABLES, s3Key)
Browser ◄── {jobId} ──────────────────────

Browser ──(4) GET /upload/status/:jobId  ─► (every ~2 s, 3 min cap)
                                              └─► Textract.GetDocumentAnalysis(jobId)
   while IN_PROGRESS → {status: "processing"}
   when SUCCEEDED ────► blocksToText(blocks)
                     ──► Bedrock.Converse(text + prompt)
                     ──► {status: "done", recipe, reply, unresolvableRefs}
   when FAILED ──────► {status: "failed", reason: <user-friendly mapping>}
```

**Single-path** upload — no inline base64 fallback. One code path, no 4 MB cliff to maintain.

**Textract is the source of truth for job state.** No DB table, no Redis. The `jobId` Textract returns is what the client polls against. Textract retains job results for 7 days, well beyond the 3-minute client polling cap.

**The final poll is the heavy one.** Most poll responses are sub-100 ms (Textract status check). When the client's polling hits `SUCCEEDED`, that one handler does the blocks-to-text transform *and* the Bedrock call before returning. The existing "Thinking…" UI handles the 5–15 s pause cleanly.

## Components

### `alpha-infra` — extend existing IaC

**The bucket `form-builder-uploads-sandbox-7922` already exists** in the modular-forms-sandbox environment, with public-access-block, SSE-S3, CORS (`https://builder.sandbox.alpha.gov.bb`), 7-day lifecycle, HTTPS-only policy, and versioning. It is **CLI-managed**, not tofu-managed, due to a known provider 5.100.0 bug in `ca-central-1` (see header comment in `environments/sandbox/modular-forms-sandbox/form-builder-s3.tf`). The bucket was originally created for the session-based AI flow that was retired; the infra survived the app removal.

The existing IAM policy `aws_iam_role_policy.ecs_task_form_builder_uploads` already grants `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` on this bucket to the `form_builder_api` ECS task role. The existing ECS env vars `S3_BUCKET` and `S3_REGION` are already wired through.

**This change adds one thing:** a Textract IAM grant. Implemented as an additional statement on the existing `aws_iam_role_policy.ecs_task_form_builder_uploads` policy (rename it, or add a sibling — see plan for the chosen approach), allowing `textract:StartDocumentAnalysis` + `textract:GetDocumentAnalysis` on `*` (Textract doesn't support resource-level perms).

No bucket changes, no CORS changes, no lifecycle changes. The 7-day lifecycle is fine for this use case — Textract retains job results for 7 days anyway, so source PDFs are dead once the job resolves.

### `form_builder_api` — server-side

**New file:** `src/storage/s3-uploads.ts`
- Wraps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- Exports `presignUpload(): Promise<{ url, s3Key }>`. Reads bucket name from existing `S3_BUCKET` env var. Key shape: `uploads/<uuidv4>.pdf`. URL TTL: 5 minutes. Signed conditions: `Content-Type: application/pdf`, `Content-Length-Range: 0–20971520` (20 MB server-side enforcement).

**New file:** `src/ai/textract.ts`
- Wraps `@aws-sdk/client-textract`.
- Exports `startAnalysis(s3Key): Promise<{ jobId }>` (calls `StartDocumentAnalysis` with `FeatureTypes: ["FORMS", "TABLES"]`).
- Exports `getAnalysisResult(jobId): Promise<{ status, blocks?, reason? }>` — calls `GetDocumentAnalysis`, follows `NextToken` pagination internally so the caller sees one flat `blocks` array. Maps Textract's `JobStatus` to our four states: `processing` | `done` | `failed`; `PARTIAL_SUCCESS` is treated as `failed`.
- Exports pure helper `blocksToText(blocks): string` — converts Textract's block graph (KEY_VALUE_SET, SELECTION_ELEMENT, LINE, TABLE) into a compact text representation. Format is internal only:
  - Page markers (`## Page N`) between pages.
  - Form fields rendered `Label: __________`.
  - Checkboxes/radio rendered `[x]` / `[ ]` with adjacent label text.
  - Tables rendered as markdown-pipe tables.

**Modified file:** `src/ai/client.ts`
- `chat()` signature: replace `pdfPages?: string[]` with `documentText?: string`.
- When `documentText` is present, the user-message content becomes `[{ text: documentText }, { text: userText }]` — two text blocks, document first. The `document` content block is gone.

**Restructured file:** `src/routes/ai.ts`
- `POST /builder/ai/edit` — sync. Body `{ message, recipeJson }`. Returns `{ recipe, reply, unresolvableRefs }`. This is the existing `convertHandler`, renamed and stripped of the `pdfBase64` branch.
- `POST /builder/ai/upload/presign` — returns `{ url, s3Key }`.
- `POST /builder/ai/upload/process` — body `{ s3Key }`. Validates the key matches `uploads/<uuid>.pdf` (security gate against arbitrary key injection); calls `startAnalysis`; returns `{ jobId }`.
- `GET /builder/ai/upload/status/:jobId` — calls `getAnalysisResult`. On `processing`, returns `{ status: "processing" }`. On `done`, runs `blocksToText` → `chat()` → `extractRecipe` → `collectUnknownRefs` and returns `{ status: "done", recipe, reply, unresolvableRefs }`. On `failed`, returns `{ status: "failed", reason }` with user-friendly mapping (see Error handling below).

### `form_builder` — client-side

**Modified file:** `app/server/ai-builder/convert.ts`
- The single `convertRecipe()` server fn becomes a family of four:
  - `editRecipe({ message, recipeJson })` — the existing path.
  - `presignPdfUpload(): { url, s3Key }`
  - `startPdfConvert({ s3Key }): { jobId }`
  - `getPdfConvertStatus({ jobId }): { status, recipe?, reply?, unresolvableRefs?, reason? }`

**Modified file:** `app/routes/builder/-ai-sidebar.tsx`
- `MAX_PDF_BYTES = 20 * 1024 * 1024`.
- `handleUpload` rewritten:
  1. `presignPdfUpload()` → `{ url, s3Key }`.
  2. `fetch(url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: pdfFile })` — direct browser upload, no base64.
  3. `startPdfConvert({ s3Key })` → `{ jobId }`.
  4. Poll `getPdfConvertStatus({ jobId })` every 2 s with a 3-minute hard cap; AbortController fires on component unmount or on a subsequent upload starting.
  5. On `status: "done"`, run the existing `handleResponse(reply, recipe, unresolvableRefs)`.
  6. On `status: "failed"`, surface the mapped `reason` as the sidebar error message.
- `fileToBase64()` helper deleted (no longer reachable).
- The `"Invariant failed"`-decoding branch in `toMessage()` for `mode: "upload"` deleted (the 413-at-the-edge mode no longer exists).

## Data flow & payload shapes

### (1) Presign
`POST /builder/ai/upload/presign` → `{ url, s3Key }`. Server signs PUT URL with `Content-Type` and `Content-Length-Range` conditions; 5-minute TTL.

### (2) Direct browser → S3
`PUT {url}` with `Content-Type: application/pdf`, body = the `File`. Empty 200 from S3. Browser never sees AWS credentials.

### (3) Start convert
`POST /builder/ai/upload/process` body `{ s3Key }` → `{ jobId }`. Server validates key prefix, calls Textract `StartDocumentAnalysis` with `FeatureTypes: ["FORMS", "TABLES"]`, returns immediately. No DB write.

### (4) Polling
`GET /builder/ai/upload/status/:jobId` every 2 s, client-side 3-minute cap. Three terminal branches:
- `processing` → keep polling.
- `done` → response includes `recipe, reply, unresolvableRefs`. Polling stops.
- `failed` → response includes user-friendly `reason`. Polling stops.

### (5) Blocks → text (server-side, inside the `done` branch)
`blocksToText(blocks)` walks Textract's graph and emits text like:
```
## Page 1

Name: __________________________
Date of Birth: __________________________

Marital Status:
[x] Single  [ ] Married  [ ] Divorced

| Name | Age | Relationship |
| ____ | ___ | ____________ |
```

### (6) Bedrock (still server-side, same handler)
`chat(systemPrompt, [{ role: "user", content: buildUserText() }], documentText)`. User-message content = `[{ text: documentText }, { text: userText }]`. Existing `extractRecipe(reply)` + `collectUnknownRefs(recipe, catalog)` unchanged.

### Invariants
- S3 object is never read by the browser after upload.
- `jobId` is the only state carried across the polling loop. Lose it → user re-uploads.
- Once polling terminates (`done` or `failed`), the S3 object is logically dead; lifecycle expiry sweeps it within 24 h.

## Error handling

User-visible messages are quoted exactly; HTTP codes apply to the API responses.

**Pre-flight (client):**
- File > 20 MB → `"File is X MB; maximum is 20 MB. Use a smaller file or split it."`
- Non-PDF MIME → `<input accept>` filters; defensive runtime check rejects with `"Only PDF files are supported."`

**Presign step:**
- S3 client misconfigured / IAM missing → `503`. Sidebar: `"Upload service unavailable — try again in a moment."`

**S3 PUT (browser):**
- CORS / `SignatureDoesNotMatch` / network drop → `"Upload failed — please refresh and try again."` (CORS is configuration; reaching it means our bug, not the user's). Network drop mid-upload: `"Upload was interrupted. Please try again."`

**Process step:**
- `s3Key` doesn't match `uploads/<uuid>.pdf` shape → `400` with generic `"Invalid request"` (security gate; not a real user mode).
- S3 object missing (Textract `InvalidS3ObjectException`) → `404`. Sidebar: `"The uploaded file was not found. Please try again."`
- Textract `LimitExceededException` → `429`. Sidebar: `"Too many uploads in progress — please try again in a minute."`

**Status step — Textract `FAILED`:** read `StatusMessage` and map known causes:
- Password-protected → `"This PDF appears to be password-protected. Please remove the password and re-upload."`
- Corrupted / unsupported → `"We couldn't read this PDF. It may be corrupted or in an unsupported format."`
- `PARTIAL_SUCCESS` → `"The PDF was only partially readable — please try a clearer scan."`
- Any other → `"We couldn't read this PDF — please try a different file."` (raw reason logged server-side, never shown).

**Status step — Textract `InvalidJobIdException`** → `404`. Sidebar: `"This upload session expired. Please re-upload."`

**Bedrock step (after Textract `SUCCEEDED`):**
- `chat()` throws → `502` via existing error path. Textract result is dropped; user re-uploads. We do **not** cache extracted text to retry Bedrock — YAGNI for a rare failure.

**Client polling:**
- 3-minute hard cap → `"This upload is taking longer than expected. Please try a smaller PDF or try again later."` Polling stops.
- AbortController fires on unmount or on a subsequent upload starting — silent, no error shown.
- Transient `503/502` on a single poll → retry that one without resetting the cap; only surface after 3 consecutive failures.

**Explicitly NOT doing:**
- Retrying Textract on the same input (same input → same answer; user fixes the input).
- Server-side job tracking (Textract's `jobId` *is* the truth; API restarts are tolerated).
- CloudWatch alarms / DLQ on errors at this stage (sandbox grade; add separately if/when this moves toward prod).

## Testing

Following the repo's existing jest + mocked-AWS-SDK pattern; no LocalStack.

**`apps/form_builder_api/src/ai/textract.spec.ts` (new)**
Heaviest test coverage — `blocksToText()` is the heart of the change.
- Real Textract response fixtures saved to `src/ai/__fixtures__/textract/`:
  - Simple form with text fields and labels.
  - Form with checkboxes (`SELECTION_ELEMENT` with `SelectionStatus`).
  - Form with a `TABLE` block.
  - Multi-page form (assert page markers).
  - Empty doc (assert empty string, no crash).
- Assert exact output text shape for each.

**`apps/form_builder_api/src/routes/ai.upload.spec.ts` (new)**
Follow the `ai.convert.spec.ts` pattern: jest-mock `textract.ts`, `s3-uploads.ts`, `chat`, `extractRecipe` at module scope.
- `presign` → returns shape.
- `process` → rejects bad `s3Key` prefix, accepts good ones.
- `status` → all four branches: `IN_PROGRESS`, `SUCCEEDED` (→ chat → recipe in response), `FAILED` per known reason (correct user-message mapping for each), `InvalidJobIdException` (→ 404).

**`apps/form_builder_api/src/routes/ai.convert.spec.ts` → rename to `ai.edit.spec.ts`**
Adjust imports and route name. Handler logic unchanged.

**`apps/form_builder/app/routes/builder/-ai-sidebar.spec.tsx` (extend existing)**
- Existing "Edit Form" tests stay; point at `editRecipe` instead of `convertRecipe`.
- New "Upload" tests, mocking the new server-fn family:
  - Happy path: presign → fetch stubbed 200 from S3 → process returns `jobId` → status returns `processing` twice then `done` with a recipe → `onApplyRecipe` called.
  - Polling abort: component unmounts mid-poll → no further `getPdfConvertStatus` calls.
  - Polling timeout: status keeps returning `processing` past the 3-min cap → error message rendered.
  - Failed-with-password mapping: status returns `failed` with reason "password" → exact message rendered.

**Manual smoke checklist (before merging to `sandbox`)**
- ~500 KB born-digital PDF → recipe generated, applied to editor.
- ~5 MB scanned PDF → Textract OCRs, recipe generated.
- ~15 MB PDF → flow completes, polling visible in Network tab.
- Password-protected PDF → `failed` with correct user-facing message.
- 25 MB PDF → client-side rejection, no network call.
- Mid-upload refresh → no zombie polls in Network tab afterward.

## Migration & rollout

- This is a clean swap: the old `pdfBase64` field is removed from `/builder/ai/convert` (renamed to `/builder/ai/edit`). There is exactly one client (`form_builder`), and it ships in the same PR. No staged rollout.
- The S3 bucket already exists (CLI-managed `form-builder-uploads-sandbox-7922`) and the bucket-side IAM is already granted. The only missing piece is the Textract IAM grant, which lands in `alpha-infra` first. It's a small, additive policy change with no service disruption risk.
- Application CI is mock-based, so the gov-bb PR can be opened in parallel with the alpha-infra PR. Merge order: alpha-infra (Textract grant) → gov-bb (the app change), so the API has Textract perms when the new routes go live.

## Open questions / follow-ups

- **Bedrock quality on the converted text.** Manual smoke will tell us whether `blocksToText`'s representation gives the model enough structure to produce comparable-quality recipes vs. the current PDF-document-block input. If it doesn't, the next move is a hybrid input: send Bedrock *both* the extracted text *and* a downsampled rasterized PDF (well under 2 MB) so the model has layout cues alongside structure. Out of scope for this spec.
- **Cost monitoring.** Textract is $1.50 per 1,000 pages for FORMS. Sandbox volume is trivial; if/when this moves toward prod, add a CloudWatch alarm on Textract spend.
- **Beyond 20 MB.** Architecture supports it (async Textract goes to 500 MB). If a user actually shows up with a real >20 MB form, lifting the cap is a config change to `Content-Length-Range` + the client guard.
