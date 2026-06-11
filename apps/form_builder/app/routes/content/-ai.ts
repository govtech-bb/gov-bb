import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "../../server/api-client";
import { sessionTokenOrDev } from "../../server/auth/session-or-dev";

/**
 * Proxy to the form_builder_api's content AI endpoint
 * (POST /builder/ai/content). The model proposes page fields; the editor
 * applies them to the local draft — deploying stays a separate, human action.
 *
 * Uses `sessionTokenOrDev` (not `requireSession`) so local dev without a
 * GitHub session can still hit the API, matching the rest of /content.
 */

interface ContentAiResponse {
  /** Proposed page fields (partial), or null when the model only replied in prose. */
  page: Record<string, unknown> | null;
  reply: string;
}

// strict:false — Record<string, unknown> trips TanStack Start's serializable
// check the same way ConvertResponse.recipe does (see ai-builder/convert.ts).
export const generateContentPage = createServerFn({
  method: "POST",
  strict: false,
})
  .middleware([sessionTokenOrDev])
  .inputValidator(
    z.object({
      message: z.string().min(1),
      pageJson: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ContentAiResponse> => {
    return api.post<ContentAiResponse>("/builder/ai/content", {
      message: data.message,
      pageJson: data.pageJson,
    });
  });
