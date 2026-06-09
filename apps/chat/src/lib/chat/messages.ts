import type { UIMessage } from "@tanstack/ai";

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;
type ToolCallPart = Extract<UIMessage["parts"][number], { type: "tool-call" }>;

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

// The model (especially smaller ones like Haiku) sometimes WRITES a tool call
// into its text reply — e.g. `set_field({ fieldId: "x", value: "y" })` — on top
// of actually invoking it. The real invocation is a separate `tool-call` part
// and is handled/hidden by the renderer; this leaked prose must not reach the
// bubble. Strip any text that is just a known tool call, whether bare or wrapped
// in a ``` code fence. Tool names mirror chat-tools.ts (set_field /
// present_choices / submit_form). Defence-in-depth alongside the prompt rule
// that tells the model not to narrate tool calls in the first place.
const TOOL_CALL_BODY =
  "(?:set_field|ask_field|present_choices|submit_form)\\s*\\((?:\\s*\\{[\\s\\S]*?\\}\\s*|\\s*)\\)";
const FENCED_TOOL_CALL = new RegExp(
  "```[a-zA-Z]*\\s*" + TOOL_CALL_BODY + "\\s*```",
  "g",
);
const BARE_TOOL_CALL = new RegExp("\\b" + TOOL_CALL_BODY, "g");

export function stripLeakedToolCalls(text: string): string {
  return text
    .replace(FENCED_TOOL_CALL, "")
    .replace(BARE_TOOL_CALL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
