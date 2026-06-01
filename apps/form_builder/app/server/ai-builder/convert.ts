import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "../api-client";
import type { ConvertResponse } from "./types";
import { requireSession } from "../auth/require-session";

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<{ available: boolean; message: string }> => {
    return api.get("/builder/ai/status");
  });

// Single stateless AI call. The builder owns the live draft, so each turn is
// self-contained: an Edit Form tweak sends { message, recipeJson }; an Upload
// sends { pdfBase64 }. There is no session to create, replay, or lose.
//
// PDF is sent inline as base64 in the server-fn body. The Amplify SSR Lambda
// caps requests at ~6 MB, so the sidebar guards uploads at 4 MB client-side.
export const convertRecipe = createServerFn({ method: "POST", strict: false })
  .middleware([requireSession])
  .inputValidator(
    z
      .object({
        message: z.string().optional(),
        recipeJson: z.string().optional(),
        pdfBase64: z.string().optional(),
      })
      .refine(
        (d) => Boolean(d.message || d.recipeJson || d.pdfBase64),
        "Provide at least one of message, recipeJson, or pdfBase64",
      ),
  )
  .handler(async ({ data }): Promise<ConvertResponse> => {
    return api.post<ConvertResponse>("/builder/ai/convert", {
      message: data.message,
      recipeJson: data.recipeJson,
      pdfBase64: data.pdfBase64,
    });
  });
