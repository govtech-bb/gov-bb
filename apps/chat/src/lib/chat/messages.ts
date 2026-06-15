import type { TextPart, ToolCallPart, UIMessage } from "@tanstack/ai";

export function extractText(message: UIMessage): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.content ?? "")
      .join("")
      .trim();
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content.trim() : "";
}

// Hard cap on how many recent messages reach the LLM (#973). The form session's
// collected values live server-side (keyed by threadId), NOT in the message
// history, so trimming old turns never loses form state — it only bounds the
// per-call token cost and blunts cost-DoS via an ever-growing history array.
// Keeps the most recent turns (where the live context is).
export const MAX_HISTORY_MESSAGES = 24;

export function capMessageHistory(
  messages: UIMessage[],
  max: number = MAX_HISTORY_MESSAGES,
): UIMessage[] {
  return messages.length > max ? messages.slice(-max) : messages;
}

export function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return extractText(messages[i]);
  }
  return "";
}

// Text of the most recent ASSISTANT message. Used to read what we just said —
// e.g. whether we asked the "anything else?" wrap-up question, which decides
// whether a terse "no"/"ok" reply is a conversational closer or a mid-task answer.
export function lastAssistantText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return extractText(messages[i]);
  }
  return "";
}

// Concatenated text of the last `limit` user messages. Used by intent-style
// matchers that need conversational context but not the whole history.
export function recentUserText(messages: UIMessage[], limit = 5): string {
  const parts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && parts.length < limit; i--) {
    if (messages[i].role === "user") parts.unshift(extractText(messages[i]));
  }
  return parts.join(" ");
}

export function findToolCall(
  message: UIMessage,
  name: string,
): ToolCallPart | undefined {
  return message.parts
    .filter((p): p is ToolCallPart => p.type === "tool-call")
    .find((p) => p.name === name);
}

export function hasAnyToolCall(
  messages: UIMessage[],
  names: string[],
): boolean {
  return messages.some((m) =>
    m.parts.some((p) => p.type === "tool-call" && names.includes(p.name)),
  );
}

// True when the conversation is paused on a form question: the latest message
// is the assistant's and carries an ask_field call. Drives mode-aware UI (the
// composer placeholder reads "Type your answer…" instead of "Ask a
// question..." — mid-form, the assistant is the one asking).
export function awaitingFieldAnswer(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return !!findToolCall(last, "ask_field");
}
