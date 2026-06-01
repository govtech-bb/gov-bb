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
// text, shown in the sidebar conversation either way.
export interface ConvertResponse {
  recipe: Record<string, unknown> | null;
  reply: string;
}
