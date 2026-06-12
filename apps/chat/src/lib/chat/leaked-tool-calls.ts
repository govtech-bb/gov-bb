// The model (especially smaller ones like Haiku) sometimes WRITES a tool call
// into its text reply — e.g. `set_field({ fieldId: "x", value: "y" })` — on top
// of actually invoking it. The real invocation is a separate `tool-call` part
// and is handled/hidden by the renderer; this leaked prose must not reach the
// bubble. Tool names mirror chat-tools.ts (set_field / present_choices /
// submit_form). Defence-in-depth alongside the prompt rule that tells the
// model not to narrate tool calls in the first place.
//
// Two consumers: toolCallGuardMiddleware strips the stream server-side (so the
// leak never lands in persisted history), and stripLeakedToolCalls is the
// client-side display backstop for leaks longer than the guard's look-behind
// buffer.
const TOOL_CALL_BODY =
  "(?:set_field|ask_field|present_choices|review_form|submit_form)\\s*\\((?:\\s*\\{[\\s\\S]*?\\}\\s*|\\s*)\\)";
export const FENCED_TOOL_CALL = new RegExp(
  "```[a-zA-Z]*\\s*" + TOOL_CALL_BODY + "\\s*```",
  "g",
);
export const BARE_TOOL_CALL = new RegExp("\\b" + TOOL_CALL_BODY, "g");

export function stripLeakedToolCalls(text: string): string {
  return text
    .replace(FENCED_TOOL_CALL, "")
    .replace(BARE_TOOL_CALL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
