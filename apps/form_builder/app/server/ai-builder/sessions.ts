import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "../api-client";
import type { PublishResponse, SessionResponse } from "./types";
import { requireSession } from "../auth/require-session";

const sessionIdSchema = z.object({ sessionId: z.string() });

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<{ available: boolean; message: string }> => {
    return api.get("/builder/ai/status");
  });

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ name: z.string().optional() }))
  .handler(async ({ data }): Promise<SessionResponse> => {
    return api.post<SessionResponse>("/builder/ai/sessions", {
      name: data?.name,
    });
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      sessionId: z.string(),
      message: z.string().min(1),
      s3Key: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SessionResponse> => {
    return api.post<SessionResponse>(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/message`,
      { message: data.message, s3Key: data.s3Key },
    );
  });

// PDFs are uploaded directly to S3 via a presigned PUT so the AI builder isn't
// constrained by the ~6 MB Amplify SSR Lambda request body cap. The client
// calls this, PUTs the file to `uploadUrl`, then calls `sendMessage` with the
// returned `s3Key`. ADMIN_API_TOKEN never leaves the SSR layer.
export const getPdfUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      sessionId: z.string(),
      filename: z.string().min(1),
      contentType: z.string().min(1),
      size: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }): Promise<{ uploadUrl: string; s3Key: string }> => {
    return api.post("/builder/ai/presigned-upload", data);
  });

export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<SessionResponse> => {
    return api.get<SessionResponse>(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}`,
    );
  });

export const getRecipe = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<{ recipe: Record<string, unknown> }> => {
    return api.get(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/recipe`,
    );
  });

export const extractRecipeFromSession = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<{ recipe: Record<string, unknown> }> => {
    return api.post(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/extract`,
      {},
    );
  });

export const publishSession = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({ sessionId: z.string(), formId: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<PublishResponse> => {
    return api.post<PublishResponse>(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/publish`,
      { formId: data.formId },
    );
  });

export const deletePublished = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<{ message: string }> => {
    return api.post(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/delete`,
      {},
    );
  });
