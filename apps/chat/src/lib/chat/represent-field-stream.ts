import type { StreamChunk } from "@tanstack/ai";
import { EventType } from "@tanstack/ai";
import type { AskFieldSpec } from "./form/field-spec";

export interface RepresentStreamContext {
  runId?: string;
  threadId: string;
  model: string;
}

// Deterministically render a form question WITHOUT invoking the model. Emits
// the exact chunk shape a model-driven ask_field turn produces — an assistant
// message carrying an "ask_field" tool-call part whose result is the field spec
// — so the existing bubble renders the same widget (label + option pills).
//
// Used when the server records an option click itself, or re-presents a
// re-triggered form, instead of routing an ambiguous label through the model
// (which mis-reads "Okay" as chit-chat, or narrates "pick an option above" on a
// repeat). The chunk sequence mirrors blockedMessageStream: a hand-built turn
// the client's stream processor treats identically to a real one.
export async function* representFieldStream(
  field: AskFieldSpec,
  ctx: RepresentStreamContext,
): AsyncGenerator<StreamChunk> {
  const timestamp = Date.now();
  const messageId = `represent-${timestamp}`;
  const runId = ctx.runId ?? `represent-run-${timestamp}`;
  const toolCallId = `represent-ask-${timestamp}`;
  const { threadId, model } = ctx;
  // ask_field's tool RESULT is what the client renders from (bubble.tsx reads
  // part.output), so the widget data rides on the result, not the args.
  const result = JSON.stringify({ ok: true, field });

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp,
  } as StreamChunk;
  // TOOL_CALL_START creates the assistant message (ensureAssistantMessage) and
  // the ask_field tool-call part; parentMessageId pins both to one message.
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "ask_field",
    parentMessageId: messageId,
    model,
    timestamp,
  } as StreamChunk;
  // TOOL_CALL_END with `result` finalises the args AND attaches the output,
  // moving the part to "complete" — the state bubble.tsx requires to render.
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    input: {},
    result,
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
