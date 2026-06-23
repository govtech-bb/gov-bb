import type { UnknownRef } from "@govtech-bb/form-builder";

export interface ChatMessage {
  // "status" is an editor-emitted line reporting an apply outcome (applied /
  // unchanged / extraction-failed) — distinct from the model's "assistant" prose.
  role: "user" | "assistant" | "status";
  content: string;
}

// Async text-only AI edits: POST /builder/ai/edit/start returns a jobId; the
// client polls GET /builder/ai/edit/status/:jobId. Mirrors the PDF pipeline so
// no single SSR request approaches the Amplify ~28s timeout (#1129).
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
  | { status: "generating" }
  | ({ status: "done" } & ConvertResponse)
  | { status: "failed"; reason: string };

// Polling response from /builder/ai/edit/status/:jobId. Like the upload status
// minus the Textract "processing" phase — an edit is pure Bedrock generation.
export type EditStatusResponse =
  | { status: "generating" }
  | ({ status: "done" } & ConvertResponse)
  | { status: "failed"; reason: string };
