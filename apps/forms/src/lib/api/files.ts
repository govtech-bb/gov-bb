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

/** Raised when any step of the upload flow fails; `stage` says which one. */
export class FileUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: UploadStage,
  ) {
    super(message);
    this.name = "FileUploadError";
  }
}

async function postJson<T>(
  endpoint: string,
  body: unknown,
  stage: UploadStage,
  previewToken?: string,
  draftToken?: string,
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
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new FileUploadError(
      "Unable to reach the server. Please check your connection and try again.",
      stage,
    );
  }
  if (!response.ok) {
    throw new FileUploadError(
      `File upload failed (${stage}). Please try again.`,
      stage,
    );
  }
  // The API wraps payloads as { status, message, data, ... }.
  const json = (await response.json()) as { data: T };
  return json.data;
}

export const presignUpload = (
  req: PresignUploadRequest,
  previewToken?: string,
  draftToken?: string,
): Promise<PresignUploadResponse> =>
  postJson<PresignUploadResponse>(
    "/files/presign-upload",
    req,
    "presign",
    previewToken,
    draftToken,
  );

export const confirmUpload = (
  req: ConfirmUploadRequest,
  previewToken?: string,
  draftToken?: string,
): Promise<UploadedFile> =>
  postJson<UploadedFile>(
    "/files/confirm-upload",
    req,
    "confirm",
    previewToken,
    draftToken,
  );

export const putFileToS3 = async (
  uploadUrl: string,
  file: File,
): Promise<void> => {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      // Must match the contentType sent at presign time.
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new FileUploadError(
      "Unable to upload the file. Please check your connection and try again.",
      "put",
    );
  }
  if (!response.ok) {
    throw new FileUploadError(
      `File upload failed (${response.status}). Please try again.`,
      "put",
    );
  }
};

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
}

/**
 * Runs the full upload flow for a single file:
 *   presign → PUT to S3 → confirm.
 * Returns the confirmed reference to store in form state / the submission.
 */
export const uploadFile = async ({
  file,
  formId,
  stepId,
  fieldId,
  previewToken,
  draftToken,
}: UploadFileParams): Promise<UploadedFile> => {
  const presign = await presignUpload(
    {
      formId,
      stepId,
      fieldId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
    previewToken,
    draftToken,
  );

  await putFileToS3(presign.uploadUrl, file);

  return confirmUpload(
    {
      key: presign.key,
      formId,
      stepId,
      fieldId,
    },
    previewToken,
    draftToken,
  );
};
