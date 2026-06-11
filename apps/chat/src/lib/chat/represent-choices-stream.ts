import type { StreamChunk } from "@tanstack/ai";
import { EventType } from "@tanstack/ai";
import type { RepresentStreamContext } from "./represent-field-stream";

// Deterministically render a present_choices question WITHOUT invoking the
// model — the sibling of representFieldStream for the feedback disambiguation
// pills. Emits the exact chunk shape a model-driven present_choices turn
// produces, so bubble.tsx renders the same choice buttons.
//
// Unlike ask_field (whose widget data rides on the tool RESULT), present_choices
// is read by the client from the tool-call ARGUMENTS (bubble.tsx:
// parseChoiceArgs(choicesPart.arguments)). So the {question, choices} payload
// goes in `input` here; the result is the no-op {shown:true} the server tool
// returns. Used when the server decides to ask the feedback question itself
// (run-turn), instead of routing an ambiguous turn through the model.
export async function* representChoicesStream(
  question: string,
  choices: string[],
  ctx: RepresentStreamContext,
): AsyncGenerator<StreamChunk> {
  const timestamp = Date.now();
  const messageId = `represent-${timestamp}`;
  const runId = ctx.runId ?? `represent-run-${timestamp}`;
  const toolCallId = `represent-choices-${timestamp}`;
  const { threadId, model } = ctx;

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp,
  } as StreamChunk;
  // TOOL_CALL_START creates the assistant message and the present_choices part;
  // parentMessageId pins both to one message.
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "present_choices",
    parentMessageId: messageId,
    model,
    timestamp,
  } as StreamChunk;
  // TOOL_CALL_END finalises the args (the {question, choices} the client renders
  // the pills from) and attaches the no-op result, moving the part to complete.
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    input: { question, choices },
    result: JSON.stringify({ shown: true }),
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
