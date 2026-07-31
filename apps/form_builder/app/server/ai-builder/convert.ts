import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "../api-client";
import type { EditStatusResponse, UploadStatusResponse } from "./types";
import { requireSession } from "../auth/require-session";

// Text-only edits — async job, mirroring the PDF pipeline so no single SSR
// request approaches the Amplify ~28s timeout (#1129). startEditRecipe returns
// a jobId immediately; the sidebar polls getEditStatus until generation
// finishes. The PDF upload path uses presignPdfUpload + startPdfConvert +
// getPdfConvertStatus below.
export const startEditRecipe = createServerFn({ method: "POST" })
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
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    return api.post("/builder/ai/edit/start", {
      message: data.message,
      recipeJson: data.recipeJson,
    });
  });

// strict:false for the same reason as getPdfConvertStatus — EditStatusResponse's
// "done" branch carries ConvertResponse, which contains Record<string, unknown>,
// which TanStack Start's ValidateSerializable can't prove is serializable.
export const getEditStatus = createServerFn({ method: "GET", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }): Promise<EditStatusResponse> => {
    return api.get(`/builder/ai/edit/status/${encodeURIComponent(data.jobId)}`);
  });

export const presignPdfUpload = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(
    async (): Promise<{
      url: string;
      fields: Record<string, string>;
      s3Key: string;
    }> => {
      return api.post("/builder/ai/upload/presign", {});
    },
  );

export const startPdfConvert = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({ s3Key: z.string(), context: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    return api.post("/builder/ai/upload/process", {
      s3Key: data.s3Key,
      ...(data.context ? { context: data.context } : {}),
    });
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
