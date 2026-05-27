export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionResponse {
  sessionId: string;
  messages: ChatMessage[];
  recipe: Record<string, any> | null;
}

export interface PublishResponse {
  formId: string;
  message: string;
  sql: string;
  // Returned by form_builder_api but no longer read by the frontend — preview
  // links are now built locally from VITE_FORMS_URL + formId (lib/form-url.ts).
  previewUrl?: string;
}
