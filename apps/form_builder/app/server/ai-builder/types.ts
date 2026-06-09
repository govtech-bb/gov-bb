import type { UnknownRef } from "@govtech-bb/form-builder";

export interface ChatMessage {
  // "status" is an editor-emitted line reporting an apply outcome (applied /
  // unchanged / extraction-failed) — distinct from the model's "assistant" prose.
  role: "user" | "assistant" | "status";
  content: string;
}

// Synchronous /builder/ai/edit — text-only AI edits.
export interface EditRequest {
  message?: string;
  recipeJson?: string;
}

// Response from edit AND from the terminal upload/status poll. `recipe` is null
// when the model replied conversationally without emitting a recipe. (#504)
export interface ConvertResponse {
  recipe: Record<string, unknown> | null;
  reply: string;
  unresolvableRefs: UnknownRef[];
}

// Polling response from /builder/ai/upload/status/:jobId
export type UploadStatusResponse =
  | { status: "processing" }
  | ({ status: "done" } & ConvertResponse)
  | { status: "failed"; reason: string };
