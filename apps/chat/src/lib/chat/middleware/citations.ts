import { EventType } from "@tanstack/ai";
import type { ChatMiddleware, CustomEvent } from "@tanstack/ai";
import type { LinkTokenMap } from "../link-tokens";
import type { Citation } from "#/lib/rag/types";

// Emit the turn's surfaced metadata — citations + link tokens — as a CUSTOM
// stream event right after the assistant message id is known (TEXT_MESSAGE_START),
// so the client can store it keyed by messageId. The link-token map lets the
// client swap the model's opaque link_N tokens back to real URLs at render time.
// This is the example's pattern: server injects a CUSTOM event, client reads
// onCustomEvent. (The form handoff link is woven into the model's prose, not
// surfaced here — see handoffLinkInstruction.)
export function citationsMiddleware(
  citations: Citation[],
  linkTokens: LinkTokenMap = {},
): ChatMiddleware {
  let emitted = false;
  return {
    name: "citations",
    onChunk: (_ctx, chunk) => {
      if (emitted || citations.length === 0) return;
      // Emit once, keyed by the assistant message id. The client stores by
      // messageId, so an unkeyed event would be dropped — and a grounded answer
      // always produces text, so a turn with metadata but no TEXT_MESSAGE_START
      // isn't a real case.
      if (chunk.type === "TEXT_MESSAGE_START" && chunk.messageId) {
        emitted = true;
        return [chunk, citationsEvent(chunk.messageId, citations, linkTokens)];
      }
    },
  };
}

function citationsEvent(
  messageId: string,
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
