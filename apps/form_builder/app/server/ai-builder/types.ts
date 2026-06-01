import type { UnknownRef } from "@govtech-bb/form-builder";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Request to the stateless POST /builder/ai/convert. At least one of the three
// fields must be present: an Edit Form tweak sends { message, recipeJson }; an
// Upload sends { pdfBase64 }.
export interface ConvertRequest {
  message?: string;
  recipeJson?: string;
  pdfBase64?: string;
}

// Response from POST /builder/ai/convert. `recipe` is null when the model
// replied conversationally without emitting a recipe; `reply` is the assistant's
// text, shown in the sidebar conversation either way. `unresolvableRefs` lists
// any refs in the emitted recipe that don't resolve against the full catalog —
// the editor warns but still loads the draft so the author can fix them (#504).
export interface ConvertResponse {
  recipe: Record<string, unknown> | null;
  reply: string;
  unresolvableRefs: UnknownRef[];
}
