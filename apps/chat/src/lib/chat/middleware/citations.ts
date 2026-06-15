import { EventType } from "@tanstack/ai";
import type { ChatMiddleware, CustomEvent } from "@tanstack/ai";
import type { LinkTokenMap } from "../link-tokens";
import type { Citation } from "../types";

// Emit the citations custom event right after the assistant message id is
// known (TEXT_MESSAGE_START), so the client can store citations keyed by
// messageId instead of by stream index. The link-token map rides along
// (#1270): the client needs it to swap the model's opaque link_N tokens back
// to real URLs at render time — tokens only exist when citations do, since
// both come from the same context block.
export function citationsMiddleware(
  citations: Citation[],
  linkTokens: LinkTokenMap = {},
): ChatMiddleware {
  let emitted = false;
  return {
    name: "citations",
    onChunk: (_ctx, chunk) => {
      if (emitted || citations.length === 0) return;
      if (chunk.type === "TEXT_MESSAGE_START" && chunk.messageId) {
        emitted = true;
        return [chunk, citationsEvent(chunk.messageId, citations, linkTokens)];
      }
      if (chunk.type === "RUN_FINISHED") {
        // Tool-only turn: no TEXT_MESSAGE_START arrived. Emit unkeyed so the
        // client can attach citations to the run rather than a message.
        emitted = true;
        return [chunk, citationsEvent(undefined, citations, linkTokens)];
      }
    },
  };
}

function citationsEvent(
  messageId: string | undefined,
  citations: Citation[],
  linkTokens: LinkTokenMap,
): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: "citations",
    value: { messageId, citations, linkTokens },
    timestamp: Date.now(),
  };
}
