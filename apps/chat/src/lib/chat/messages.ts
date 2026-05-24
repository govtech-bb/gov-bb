import type { UIMessage } from "@tanstack/ai";

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;
type ToolCallPart = Extract<UIMessage["parts"][number], { type: "tool-call" }>;

export function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content ?? "")
    .join("")
    .trim();
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
