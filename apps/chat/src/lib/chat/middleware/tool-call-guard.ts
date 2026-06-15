import type { ChatMiddleware } from "@tanstack/ai";
import { contentGuardMiddleware } from "@tanstack/ai/middlewares";
import { BARE_TOOL_CALL, FENCED_TOOL_CALL } from "../leaked-tool-calls";

// Server-side strip of tool-call prose the model leaks into its text reply
// (e.g. Haiku narrating `set_field({...})` on top of actually invoking it).
// The client-side stripLeakedToolCalls is display-only — the leaked prose
// still lands in the persisted history and round-trips back to the model on
// every later turn. Filtering the stream itself keeps history clean.
//
// bufferSize 120 holds back a look-behind window so a leak split across
// stream deltas is still caught; leaks longer than that slip through here and
// are caught by the client strip (kept as the display backstop).
export function toolCallGuardMiddleware(): ChatMiddleware {
  return contentGuardMiddleware({
    rules: [
      { pattern: FENCED_TOOL_CALL, replacement: "" },
      { pattern: BARE_TOOL_CALL, replacement: "" },
    ],
    bufferSize: 120,
    onFiltered: (info) => {
      console.warn(
        `tool-call-guard: stripped leaked tool call message=${info.messageId} chars=${info.original.length - info.filtered.length}`,
      );
    },
  });
}
