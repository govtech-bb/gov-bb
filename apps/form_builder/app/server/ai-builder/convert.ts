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
export const editRecipe = createServerFn({ method: "POST" })
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

export const getPdfConvertStatus = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }): Promise<UploadStatusResponse> => {
    return api.get(
      `/builder/ai/upload/status/${encodeURIComponent(data.jobId)}`,
    );
  });
