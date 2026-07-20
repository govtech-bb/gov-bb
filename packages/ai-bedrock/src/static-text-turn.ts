import {
  EventType,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StreamChunk,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
} from "@tanstack/ai";

export interface TextTurnIds {
  runId: string;
  threadId: string;
  messageId: string;
  model: string;
}

// The canonical AG-UI text-turn sequence
// (RUN_STARTED → TEXT_MESSAGE_START → _CONTENT → _END → RUN_FINISHED) for a
// complete assistant reply whose text is already known — no model call, no
// streaming. This is the shape the Bedrock adapter (stream.ts) produces for a
// plain text turn; consumers that fabricate a text turn (jailbreak refusals,
// the E2E mock) `yield*` this so the wire stays identical to a real reply.
//
// `messageId` is an input so each caller keeps its own id scheme; `finishReason`
// is fixed to "stop" and no usage/parentRunId is emitted (no consumer uses them).
export function* emitTextTurn(
  text: string,
  ids: TextTurnIds,
): Generator<StreamChunk> {
  const { runId, threadId, messageId, model } = ids;
  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp: Date.now(),
  } satisfies RunStartedEvent;
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    model,
    timestamp: Date.now(),
  } satisfies TextMessageStartEvent;
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: text,
    model,
    timestamp: Date.now(),
  } satisfies TextMessageContentEvent;
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    model,
    timestamp: Date.now(),
  } satisfies TextMessageEndEvent;
  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    model,
    timestamp: Date.now(),
    finishReason: "stop",
  } satisfies RunFinishedEvent;
}
