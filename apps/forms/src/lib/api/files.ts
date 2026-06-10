import type { UploadedFile } from "@forms/types";

// Same resolution as the forms API client. Vite injects VITE_API_URL at build;
// the jest config provides it for tests.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface PresignUploadRequest {
  formId: string;
  formVersion: string;
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
  formVersion: string;
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
): Promise<T> {
  // Forward the preview token as a header (never in the body — the API runs
  // forbidNonWhitelisted) so presign/confirm can resolve an unpublished draft,
  // mirroring the form-GET path. Omitted when no token is present.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(previewToken ? { "X-Recipe-Preview": previewToken } : {}),
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
): Promise<PresignUploadResponse> =>
  postJson<PresignUploadResponse>(
    "/files/presign-upload",
    req,
    "presign",
    previewToken,
  );

export const confirmUpload = (
  req: ConfirmUploadRequest,
  previewToken?: string,
): Promise<UploadedFile> =>
  postJson<UploadedFile>("/files/confirm-upload", req, "confirm", previewToken);

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
  formVersion: string;
  stepId: string;
  fieldId: string;
  /**
   * The `?preview=` token, present only when previewing an unpublished draft.
   * Forwarded as the X-Recipe-Preview header on presign + confirm so the API
   * resolves the DB-only draft instead of 400ing on the missing recipe.
   */
  previewToken?: string;
}

/**
 * Runs the full upload flow for a single file:
 *   presign → PUT to S3 → confirm.
 * Returns the confirmed reference to store in form state / the submission.
 */
export const uploadFile = async ({
  file,
  formId,
  formVersion,
  stepId,
  fieldId,
  previewToken,
}: UploadFileParams): Promise<UploadedFile> => {
  const presign = await presignUpload(
    {
      formId,
      formVersion,
      stepId,
      fieldId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
    previewToken,
  );

  await putFileToS3(presign.uploadUrl, file);

  return confirmUpload(
    {
      key: presign.key,
      formId,
      formVersion,
      stepId,
      fieldId,
    },
    previewToken,
  );
};
