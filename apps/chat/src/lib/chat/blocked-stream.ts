import type { StreamChunk } from "@tanstack/ai";
import { EventType } from "@tanstack/ai";

export interface BlockedStreamContext {
  runId?: string;
  threadId: string;
  model: string;
}

// A blocked turn (e.g. a jailbreak attempt caught before the LLM runs) still
// owes the user a visible reply. Stream the refusal back as a normal assistant
// text message (HTTP 200) instead of returning an HTTP error: the UI then
// renders the polite "I can only help with…" message like any other reply,
// rather than a generic error pill — and the model is still never invoked.
//
// The chunk sequence mirrors what @tanstack/ai emits for a text turn
// (RUN_STARTED → TEXT_MESSAGE_START → _CONTENT → _END → RUN_FINISHED) so the
// client's stream processor treats it identically to a real assistant message.
export async function* blockedMessageStream(
  message: string,
  ctx: BlockedStreamContext,
): AsyncGenerator<StreamChunk> {
  const timestamp = Date.now();
  const messageId = `blocked-${timestamp}`;
  const runId = ctx.runId ?? `blocked-run-${timestamp}`;
  const { threadId, model } = ctx;

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp,
  } as StreamChunk;
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    model,
    timestamp,
  } as StreamChunk;
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: message,
    model,
    timestamp,
  } as StreamChunk;
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    model,
    timestamp,
  } as StreamChunk;
  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    model,
    timestamp,
    finishReason: "stop",
  } as StreamChunk;
}
