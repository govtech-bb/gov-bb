// Server-side helpers over AG-UI chat messages (role + string content). Used by
// the rewrite + grounding stages and telemetry. (Client-side part rendering is
// separate — components map message.parts directly, the example's way.)

export type ChatMessage = { role?: string; content?: unknown };

export function messageText(m: ChatMessage | undefined): string {
  return typeof m?.content === "string" ? m.content : "";
}

export function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messageText(messages[i]);
  }
  return "";
}

// The most recent assistant message text — used to disambiguate a bare "no"/"ok"
// closer (only a closer if we just asked a wrap-up question).
export function lastAssistantText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messageText(messages[i]);
  }
  return "";
}

// The recent conversation (excluding the latest message) as plain lines, for
// the rewrite prompt's follow-up expansion. Capped per line; empties dropped.
export function recentHistory(messages: ChatMessage[], turns = 5): string {
  const trail = messages.slice(-turns - 1, -1);
  const lines = trail
    .map((m) => `${m.role}: ${messageText(m).slice(0, 300)}`)
    .filter((line) => !line.endsWith(": "));
  return lines.length ? lines.join("\n") : "(no prior turns)";
}
