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
  previewUrl?: string;
}
