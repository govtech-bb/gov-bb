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
      pdfBase64: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SessionResponse> => {
    return api.post<SessionResponse>(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/message`,
      { message: data.message, pdfBase64: data.pdfBase64 },
    );
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

export const getSql = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<{ sql: string }> => {
    return api.get(
      `/builder/ai/sessions/${encodeURIComponent(data.sessionId)}/sql`,
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
