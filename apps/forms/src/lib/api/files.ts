import type { UploadedFile } from "@forms/types";
import { requireEnv } from "../../config/env";

// Same resolution as the forms API client: required in production, defaults to
// localhost only in dev (#1366). Vite injects VITE_API_URL at build.
const API_URL = requireEnv(
  import.meta.env.VITE_API_URL,
  "VITE_API_URL",
  "http://localhost:3001",
);

export interface PresignUploadRequest {
  formId: string;
  stepId: string;
  fieldId: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxSize: number;
}

export interface ConfirmUploadRequest {
  key: string;
  formId: string;
  stepId: string;
  fieldId: string;
}

export type UploadStage = "presign" | "put" | "confirm";

/**
 * What the person sees when any part of the upload fails: a network drop, a
 * 5xx, a 429. It never names the stage — "File upload failed (presign)" meant
 * nothing to a citizen (#2422) — and the widget offers Retry next to it.
 */
export const UPLOAD_PROBLEM_MESSAGE =
  "We had a problem uploading your file. Try again.";

/**
 * Raised when any step of the upload flow fails, or is cancelled. The message
 * is always UPLOAD_PROBLEM_MESSAGE; `stage` names the step, for debugging.
 */
export class FileUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: UploadStage,
  ) {
    super(message);
    this.name = "FileUploadError";
  }
}

/**
 * How long presign or confirm may take before we give up. Confirm waits up to
 * 4s server-side for the scan tag, so this leaves a wide margin; without it a
 * stalled request would leave a row "Checking your file" forever (#2940).
 */
export const REQUEST_TIMEOUT_MS = 30_000;

async function postJson<T>(
  endpoint: string,
  body: unknown,
  stage: UploadStage,
  previewToken?: string,
  draftToken?: string,
  signal?: AbortSignal,
): Promise<T> {
  // Forward the recipe token(s) as headers (never in the body — the API runs
  // forbidNonWhitelisted) so presign/confirm resolve the file field's config
  // against the same recipe the form was loaded from, mirroring the form-GET
  // path (#1682): `X-Recipe-Preview` → the published recipe of a non-public
  // form; `X-Recipe-Draft` → the in-progress DB scratch. Omitted when absent.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(previewToken ? { "X-Recipe-Preview": previewToken } : {}),
    ...(draftToken ? { "X-Recipe-Draft": draftToken } : {}),
  };
  // Ends the request on the timeout or when the caller cancels (Remove, or the
  // field leaving the page). Built by hand: AbortSignal.any is too new for
  // some of the browsers citizens use.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), REQUEST_TIMEOUT_MS);
  const cancel = () => stop.abort();
  signal?.addEventListener("abort", cancel);
  if (signal?.aborted) stop.abort();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      signal: stop.signal,
      headers,
      body: JSON.stringify(body),
      // Attach the cross-app shared `preview` cookie so presign/confirm resolve
      // a non-public form after `canDropPreviewToken` drops the URL token and
      // the header goes with it (#2116). Mirrors the form-GET fetch; the API
      // CORS allows credentials and it's harmless on the normal citizen flow.
      credentials: "include",
    });
  } catch {
    throw new FileUploadError(UPLOAD_PROBLEM_MESSAGE, stage);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  if (!response.ok) {
    throw new FileUploadError(UPLOAD_PROBLEM_MESSAGE, stage);
  }
  // The API wraps payloads as { status, message, data, ... }.
  const json = (await response.json()) as { data: T };
  return json.data;
}

export const presignUpload = (
  req: PresignUploadRequest,
  previewToken?: string,
  draftToken?: string,
  signal?: AbortSignal,
): Promise<PresignUploadResponse> =>
  postJson<PresignUploadResponse>(
    "/files/presign-upload",
    req,
    "presign",
    previewToken,
    draftToken,
    signal,
  );

export const confirmUpload = (
  req: ConfirmUploadRequest,
  previewToken?: string,
  draftToken?: string,
  signal?: AbortSignal,
): Promise<UploadedFile> =>
  postJson<UploadedFile>(
    "/files/confirm-upload",
    req,
    "confirm",
    previewToken,
    draftToken,
    signal,
  );

/**
 * The browser reports an empty `type` for a file whose extension it cannot map
 * — a scan saved without an extension, an unrecognised document. Presign's DTO
 * requires a MIME type, so an untyped file 400s there ("contentType must be
 * MIME type format") and a required upload can never be filled. It bites the
 * fields with no `fileTypes` hardest: their picker carries no `accept`, so the
 * chooser offers files the browser has no type for. `application/octet-stream`
 * is exactly "unknown binary", and it widens nothing: a field that DOES declare
 * `fileTypes` still refuses it, because presign matches the sent type or the
 * file's extension against that allowlist and neither one hits.
 */
const resolveContentType = (file: File): string =>
  file.type || "application/octet-stream";

/**
 * PUTs the file to its presigned S3 URL. Uses XMLHttpRequest rather than fetch
 * because only XHR reports upload progress (`upload.onprogress`), which drives
 * the progress bar (#2940). `onProgress` gets the fraction sent, 0 to 1.
 * No timeout: a large file on a slow connection can rightly take minutes, so a
 * stalled upload is ended by the person (Remove) through `signal`.
 */
export const putFileToS3 = (
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const failed = () =>
      reject(new FileUploadError(UPLOAD_PROBLEM_MESSAGE, "put"));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    // Must match the contentType sent at presign time — S3 signs it, so a
    // mismatch fails the PUT with SignatureDoesNotMatch.
    xhr.setRequestHeader("Content-Type", resolveContentType(file));
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : failed();
    xhr.onerror = failed;
    xhr.onabort = failed;
    xhr.ontimeout = failed;
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });

export interface UploadFileParams {
  file: File;
  formId: string;
  stepId: string;
  fieldId: string;
  /**
   * The `?preview=` token (visibility bypass — published recipe of a non-public
   * form). Forwarded as X-Recipe-Preview on presign + confirm.
   */
  previewToken?: string;
  /**
   * The `?draft=` token (DB scratch). Forwarded as X-Recipe-Draft so the file
   * field's config resolves against the in-progress draft during review (#1682).
   */
  draftToken?: string;
  /** Called with the fraction of the file sent to S3, 0 to 1. */
  onProgress?: (fraction: number) => void;
  /** Cancels the run: Remove on an in-progress row, or the field unmounting. */
  signal?: AbortSignal;
}

/**
 * Sends one file to storage: presign → PUT to S3. Returns the object key,
 * which `checkFile` then confirms. Kept apart from the check so Retry after a
 * scan that took too long only re-checks, without uploading again.
 */
export const sendFile = async ({
  file,
  formId,
  stepId,
  fieldId,
  previewToken,
  draftToken,
  onProgress,
  signal,
}: UploadFileParams): Promise<string> => {
  const presign = await presignUpload(
    {
      formId,
      stepId,
      fieldId,
      fileName: file.name,
      contentType: resolveContentType(file),
      size: file.size,
    },
    previewToken,
    draftToken,
    signal,
  );

  await putFileToS3(presign.uploadUrl, file, onProgress, signal);
  return presign.key;
};

/** How long to wait between asking again about a file still being scanned. */
export const SCAN_RECHECK_INTERVAL_MS = 3_000;
/**
 * How long a file may stay `pending` before the widget says checking took too
 * long. Matches CaMS (#2940). Each confirm-upload call itself waits up to 4s
 * for the tag, so this is about three calls against a live API.
 */
export const SCAN_RECHECK_BUDGET_MS = 20_000;

export type CheckFileParams = Omit<UploadFileParams, "file" | "onProgress"> & {
  key: string;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Confirms an uploaded file and returns it with its scan verdict. While the
 * verdict is `pending` it asks again every SCAN_RECHECK_INTERVAL_MS, and
 * returns "timeout" rather than ask past SCAN_RECHECK_BUDGET_MS.
 */
export const checkFile = async ({
  key,
  formId,
  stepId,
  fieldId,
  previewToken,
  draftToken,
  signal,
}: CheckFileParams): Promise<UploadedFile | "timeout"> => {
  const deadline = Date.now() + SCAN_RECHECK_BUDGET_MS;
  for (;;) {
    const file = await confirmUpload(
      { key, formId, stepId, fieldId },
      previewToken,
      draftToken,
      signal,
    );
    if (file.scanStatus !== "pending") return file;
    if (Date.now() + SCAN_RECHECK_INTERVAL_MS > deadline) return "timeout";
    await wait(SCAN_RECHECK_INTERVAL_MS);
    if (signal?.aborted) {
      throw new FileUploadError(UPLOAD_PROBLEM_MESSAGE, "confirm");
    }
  }
};

/** Continue pressed while a file on the field is still uploading or checking. */
export const UPLOAD_IN_PROGRESS_MESSAGE =
  "Wait for your file to finish uploading";
/** Continue pressed while a refused or failed file is still on the field. */
export const UPLOAD_NOT_ADDED_MESSAGE =
  "Remove or retry the file that could not be added";

// File fields whose picked file isn't a form value yet, by field id, with the
// reason Continue must wait. The upload widget keeps this current and the
// field's validator reads it, so the step can't move on mid-upload or past a
// refused file (#2940) — the same shape as `placesBeingLocated` in geocode.ts.
const uploadsNotAdded = new Map<string, string>();

/** Record why `fieldId` can't be continued past, or clear it with undefined. */
export function setUploadBlock(fieldId: string, reason: string | undefined) {
  if (reason) uploadsNotAdded.set(fieldId, reason);
  else uploadsNotAdded.delete(fieldId);
}

/** Why `fieldId` can't be continued past yet; undefined when nothing blocks. */
export const uploadBlock = (fieldId: string): string | undefined =>
  uploadsNotAdded.get(fieldId);
