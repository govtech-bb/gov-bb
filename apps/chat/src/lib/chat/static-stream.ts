import {
  EventType,
  generateMessageId,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StreamChunk,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
} from "@tanstack/ai";

export interface StaticStreamContext {
  threadId: string;
  runId?: string;
  model: string;
}

// Emit a fixed text as a complete assistant turn WITHOUT calling the model —
// used for a blocked turn (jailbreak caught pre-model). The user still owes a
// visible reply, so we stream the refusal as a normal text message (HTTP 200)
// rather than an error: the UI renders the polite "I can only help with…"
// message like any other reply, and the model is never invoked.
//
// The chunk sequence mirrors what the bedrock adapter emits for a text turn
// (RUN_STARTED → TEXT_MESSAGE_START → _CONTENT → _END → RUN_FINISHED) so the
// client's stream processor treats it identically to a real assistant message.
export async function* staticAnswerStream(
  text: string,
  ctx: StaticStreamContext,
): AsyncGenerator<StreamChunk> {
  const timestamp = Date.now();
  const messageId = generateMessageId();
  const runId = ctx.runId ?? `static-${timestamp}`;
  const { threadId, model } = ctx;

  // `satisfies` (not `as`) so a typo or missing field is a compile error — the
  // bedrock adapter (ai-bedrock/stream.ts) constructs these same events the same
  // way; each is a StreamChunk union member, so it yields cleanly.
  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp,
  } satisfies RunStartedEvent;
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    model,
    timestamp,
  } satisfies TextMessageStartEvent;
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: text,
    model,
    timestamp,
  } satisfies TextMessageContentEvent;
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    model,
    timestamp,
  } satisfies TextMessageEndEvent;
  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    model,
    timestamp,
    finishReason: "stop",
  } satisfies RunFinishedEvent;
}
