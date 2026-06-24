import { emitTextTurn } from "@govtech-bb/ai-bedrock";
import { generateMessageId, type StreamChunk } from "@tanstack/ai";

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
// The chunk sequence is the canonical AG-UI text turn (RUN_STARTED →
// TEXT_MESSAGE_START → _CONTENT → _END → RUN_FINISHED), built by
// @govtech-bb/ai-bedrock's emitTextTurn so this path can't drift from what the
// bedrock adapter emits for a text turn.
export async function* staticAnswerStream(
  text: string,
  ctx: StaticStreamContext,
): AsyncGenerator<StreamChunk> {
  const runId = ctx.runId ?? `static-${Date.now()}`;
  yield* emitTextTurn(text, {
    runId,
    threadId: ctx.threadId,
    messageId: generateMessageId(),
    model: ctx.model,
  });
}
