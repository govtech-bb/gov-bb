import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "../api-client";
import type { ConvertResponse, UploadStatusResponse } from "./types";
import { requireSession } from "../auth/require-session";

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<{ available: boolean; message: string }> => {
    return api.get("/builder/ai/status");
  });

// Text-only edits — synchronous. The PDF upload path uses presignPdfUpload +
// startPdfConvert + getPdfConvertStatus below.
//
// strict:false matches the original convertRecipe fix (commit 9cca67d9):
// ConvertResponse.recipe is Record<string, unknown>, and TanStack Start's
// ValidateSerializable can't prove `unknown` is serializable, so the fetcher's
// return type collapses to `unknown` and destructuring fails under ts-jest.
export const editRecipe = createServerFn({ method: "POST", strict: false })
  .middleware([requireSession])
  .inputValidator(
    z
      .object({
        message: z.string().optional(),
        recipeJson: z.string().optional(),
      })
      .refine(
        (d) => Boolean(d.message || d.recipeJson),
        "Provide at least one of message, recipeJson",
      ),
  )
  .handler(async ({ data }): Promise<ConvertResponse> => {
    return api.post<ConvertResponse>("/builder/ai/edit", {
      message: data.message,
      recipeJson: data.recipeJson,
    });
  });

export const presignPdfUpload = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(async (): Promise<{ url: string; s3Key: string }> => {
    return api.post("/builder/ai/upload/presign", {});
  });

export const startPdfConvert = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ s3Key: z.string() }))
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    return api.post("/builder/ai/upload/process", { s3Key: data.s3Key });
  });

// strict:false for the same reason as editRecipe — UploadStatusResponse's
// "done" branch carries ConvertResponse, which contains Record<string, unknown>.
export const getPdfConvertStatus = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }): Promise<UploadStatusResponse> => {
    return api.get(
      `/builder/ai/upload/status/${encodeURIComponent(data.jobId)}`,
    );
  });
