export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CreateSessionDto {
  /** Optional name/description for the session */
  name?: string;
}

export interface SendMessageDto {
  /** The user's text message */
  message: string;
  /** Base64-encoded PDF pages (images) — sent on first message */
  pdfPages?: string[];
}

export interface SessionResponse {
  sessionId: string;
  messages: ChatMessage[];
  recipe: Record<string, unknown> | null;
}

export interface PublishDto {
  /** Override the formId slug (optional — AI generates one by default) */
  formId?: string;
}

export interface PublishResponse {
  formId: string;
  message: string;
  sql: string;
}
