# Form-builder PDF upload hardening — design

**Issue:** [#16 — Form-builder PDF upload accepts any MIME type, 50 MB body, no fileFilter](https://github.com/govtech-bb/gov-bb/issues/16)
**Severity:** High (combined with #11 no-auth and #12 no-throttle, this is an anonymously-reachable DoS / cost-amplification vector)
**Date:** 2026-05-21
**Branch:** `fix/form-builder-pdf-validation` (off `dev`)

## Problem

`apps/api/src/form-builder/form-builder.controller.ts:59-61` declares:

```ts
@UseInterceptors(
  FileInterceptor("pdf", { limits: { fileSize: 50 * 1024 * 1024 } }),
)
async sendMessage(
  …,
  @UploadedFile() file?: any,
)
```

- No `fileFilter`, so any MIME and any bytes are accepted.
- Parameter typed as `any` — no compile-time guard.
- The uploaded buffer is base64-encoded and forwarded to Anthropic/Bedrock at operator cost.

Additionally, `apps/api/src/main.ts:22-23` sets a **global** 50 MB JSON / urlencoded body parser limit, originally intended for the form-builder upload — but the form-builder upload is `multipart/form-data`, not JSON, so the 50 MB JSON ceiling is unused yet leaves every other route exposed to outsize JSON bodies.

## Scope

This PR implements suggested resolutions 1–4 from the issue. Resolution 5 (per-session and per-IP cost caps) is deferred to a follow-up that builds on #11 (auth) and #12 (throttle) — those issues are still open and the per-IP work overlaps with whatever throttle infrastructure lands there.

In scope:

1. `fileFilter` rejecting non-`application/pdf` MIME types.
2. Magic-byte check (`%PDF-` prefix) on the buffer.
3. Parameter typed as `Express.Multer.File` instead of `any`.
4. Reduce the global JSON body limit to 1 MB; drop the unused 50 MB urlencoded limit.

Out of scope:

5. Session / IP cost caps (deferred to follow-up after #11, #12).

## Architecture

### New module: `apps/api/src/form-builder/pdf-validation.ts`

Exports three things:

- `PDF_MIME_TYPE` — string constant `"application/pdf"`.
- `isPdfBuffer(buf: Buffer): boolean` — returns true if `buf` starts with the 5-byte PDF magic prefix (`%PDF-`).
- `pdfFileFilter(req, file, cb)` — Multer file-filter signature. Accepts when `file.mimetype === PDF_MIME_TYPE`; otherwise calls `cb(HttpException(415), false)`.

Magic bytes are stored as a `Buffer`, compared with `Buffer.subarray(0, 5).equals(PDF_MAGIC)` after a length guard. PDF files always begin with `%PDF-` followed by a version (e.g. `1.4`, `1.7`, `2.0`); the 5-byte prefix is the canonical PDF signature.

`pdfFileFilter` cannot perform the magic-byte check because Multer invokes the filter *before* buffering the file — `file.buffer` doesn't exist at filter time. Magic-byte validation therefore happens in the controller handler after Multer has produced the full buffer.

### Modified: `apps/api/src/form-builder/form-builder.controller.ts`

- Add `fileFilter: pdfFileFilter` to the existing `FileInterceptor` options.
- Replace `@UploadedFile() file?: any` with `@UploadedFile() file?: Express.Multer.File`.
- Before the existing `try` block, add:
  ```ts
  let pdfPages: string[] | undefined;
  if (file) {
    if (!isPdfBuffer(file.buffer)) {
      throw new HttpException(
        "Uploaded file is not a valid PDF (magic bytes missing)",
        HttpStatus.BAD_REQUEST,
      );
    }
    pdfPages = [file.buffer.toString("base64")];
  }
  ```
- The magic-byte check sits *outside* the existing `try/catch` so that input validation runs before the AI service call, not as part of error-mapping for that call.

The file already uses the generic `HttpException(message, HttpStatus.X)` form throughout. To match the file's existing style, both new throws (in the helper and in the controller) use that form rather than the named subclasses (`UnsupportedMediaTypeException`, `BadRequestException`).

### Modified: `apps/api/src/main.ts`

```ts
// before
app.use(require("express").json({ limit: "50mb" }));
app.use(require("express").urlencoded({ limit: "50mb", extended: true }));

// after
app.use(require("express").json({ limit: "1mb" }));
```

The misleading `// Increase body size limit for form-builder PDF uploads (base64-encoded pages)` comment is removed — the form-builder upload is multipart, not JSON, so the body-parser limit has no relationship to it. The `urlencoded` line is dropped entirely because no route in this API accepts `application/x-www-form-urlencoded`.

## Error responses

| Condition | Status | Source | Body |
|---|---|---|---|
| Valid `application/pdf` upload with correct magic bytes | 200 (existing) | Handler | Existing `SessionResponse` |
| Non-`application/pdf` MIME | 415 | `pdfFileFilter` via Multer | `{ statusCode: 415, message: "Only application/pdf uploads are accepted" }` |
| `application/pdf` MIME but bytes don't start with `%PDF-` | 400 | Handler | `{ statusCode: 400, message: "Uploaded file is not a valid PDF (magic bytes missing)" }` |
| Upload > 50 MB | 413 (existing) | Multer | Existing Multer `LIMIT_FILE_SIZE` error |
| JSON body > 1 MB on any other route | 413 (new) | body-parser | Standard 413 |

**Risk:** Nest may wrap `HttpException` thrown from inside Multer's `fileFilter` as a generic `BadRequestException` (the documented Multer-error → 400 pathway in `@nestjs/platform-express`). The oracle for whether this happens is the local smoke test (`test 2` in the Local Verification section): if it returns 400 instead of 415, downgrade `pdfFileFilter` to throw `HttpException(..., HttpStatus.BAD_REQUEST)` and update the error-response table. We don't pre-commit to 415 in code review without that signal. The `pdfFileFilter` unit test asserts only that the constructed `HttpException` has status 415 — it doesn't claim anything about Multer's wrapping behavior.

## Tests

### `apps/api/src/form-builder/pdf-validation.spec.ts` (new)

Pure unit tests, no Nest module.

- `isPdfBuffer`
  - Returns true for a buffer starting with `%PDF-1.7`.
  - Returns false for a buffer of arbitrary bytes (no `%PDF-` prefix).
  - Returns false for a 4-byte buffer (shorter than magic).
  - Returns false for an empty buffer.
  - Returns false when `%PDF-` appears at offset > 0 (must be the prefix, not embedded).
- `pdfFileFilter`
  - `cb(null, true)` when `file.mimetype === "application/pdf"`.
  - `cb(HttpException(415), false)` when `mimetype` is `"application/zip"`.
  - `cb(HttpException(415), false)` when `mimetype` is the empty string.

### `apps/api/src/form-builder/form-builder.controller.spec.ts` (new)

Built with `@nestjs/testing`, mocking `FormBuilderService` and `AiService`. Follows the pattern of `apps/api/src/payments/payment-webhook.controller.spec.ts`.

- `sendMessage` forwards the base64 PDF when a valid `Express.Multer.File` with `%PDF-` buffer is provided.
- `sendMessage` succeeds with no file (text-only message — regression).
- `sendMessage` throws `HttpException(400)` when the uploaded file's buffer lacks `%PDF-` magic bytes.
- `sendMessage` throws `HttpException(400)` when `message` is empty (regression).
- `sendMessage` throws `HttpException(503)` when `AiService.isAvailable()` returns false (regression).

The fileFilter wiring is *not* exercised here — Multer doesn't run in a Nest unit test; the filter behavior is covered by the `pdfFileFilter` unit test plus the local manual smoke test.

## Local verification (before push)

After `pnpm --filter api run start:dev`:

```bash
# 1. Valid PDF → 200
curl -X POST http://localhost:3001/form-builder/sessions/<id>/messages \
  -F "message=test" -F "pdf=@/path/to/real.pdf"

# 2. Non-PDF MIME (zip) → 415 (or 400 if Nest collapses the exception)
curl -X POST http://localhost:3001/form-builder/sessions/<id>/messages \
  -F "message=test" -F "pdf=@/tmp/foo.zip"

# 3. PDF MIME but garbage bytes → 400
cp /tmp/foo.zip /tmp/foo.pdf
curl -X POST http://localhost:3001/form-builder/sessions/<id>/messages \
  -F "message=test" -F "pdf=@/tmp/foo.pdf;type=application/pdf"

# 4. 2 MB JSON body on any non-upload route → 413
curl -X POST http://localhost:3001/form-builder/sessions \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/2mb.json
```

Tests 2 and 3 together prove both layers of validation. Test 4 proves the global body-limit reduction.

## What this PR does not change

- `FormBuilderService.sendMessage`'s contract — it still receives `pdfPages?: string[]`. The base64 string passed in is now guaranteed to be a real PDF.
- Authentication / authorization on the route (covered by #11).
- Per-session or per-IP rate / cost caps (covered by #12 and the deferred resolution #5).
- The 50 MB upload limit itself — keeping it generous because legitimate government-form PDFs can be large; the real fix for cost amplification is auth + throttle + per-session cap, not lowering the per-request size.

## Dependencies

None. `Express.Multer.File` is provided by `@types/multer`, which is already in scope transitively via `@nestjs/platform-express`.

## Rollout

Single PR against `dev`. No migration. No feature flag. Worst-case rollback is a single revert commit; behavior change is purely additive validation on a single route plus a body-parser limit change.
