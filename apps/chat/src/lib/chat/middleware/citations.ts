import { EventType } from "@tanstack/ai";
import type { ChatMiddleware, CustomEvent } from "@tanstack/ai";
import type { Citation } from "../types";

// Emit the citations custom event right after the assistant message id is
// known (TEXT_MESSAGE_START), so the client can store citations keyed by
// messageId instead of by stream index.
export function citationsMiddleware(citations: Citation[]): ChatMiddleware {
  let emitted = false;
  return {
    name: "citations",
    onChunk: (_ctx, chunk) => {
      if (emitted || citations.length === 0) return;
      if (chunk.type === "TEXT_MESSAGE_START" && chunk.messageId) {
        emitted = true;
        return [chunk, citationsEvent(chunk.messageId, citations)];
      }
      if (chunk.type === "RUN_FINISHED") {
        // Tool-only turn: no TEXT_MESSAGE_START arrived. Emit unkeyed so the
        // client can attach citations to the run rather than a message.
        emitted = true;
        return [chunk, citationsEvent(undefined, citations)];
      }
    },
  };
}

function citationsEvent(
  messageId: string | undefined,
  citations: Citation[],
): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: "citations",
    value: { messageId, citations },
    timestamp: Date.now(),
  };
}
