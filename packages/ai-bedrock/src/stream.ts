import type {
  ContentBlock,
  ConverseStreamOutput,
  TokenUsage,
} from "@aws-sdk/client-bedrock-runtime";
import { EventType, type StreamChunk } from "@tanstack/ai";

export interface StreamTranslatorState {
  model: string;
  runId: string;
  threadId: string;
  messageId: string;
  parentRunId?: string;
  hasEmittedRunStarted: boolean;
  hasEmittedTextStart: boolean;
  hasEmittedTextEnd: boolean;
  hasEmittedRunFinished: boolean;
  pendingFinishReason:
    | "stop"
    | "tool_calls"
    | "length"
    | "content_filter"
    | null;
  toolCalls: Map<number, { id: string; name: string; args: string }>;
}

export function createTranslatorState(opts: {
  model: string;
  runId: string;
  threadId: string;
  messageId: string;
  parentRunId?: string;
}): StreamTranslatorState {
  return {
    model: opts.model,
    runId: opts.runId,
    threadId: opts.threadId,
    messageId: opts.messageId,
    parentRunId: opts.parentRunId,
    hasEmittedRunStarted: false,
    hasEmittedTextStart: false,
    hasEmittedTextEnd: false,
    hasEmittedRunFinished: false,
    pendingFinishReason: null,
    toolCalls: new Map(),
  };
}

type BedrockStopReason =
  | "tool_use"
  | "max_tokens"
  | "content_filtered"
  | "guardrail_intervened"
  | "end_turn"
  | "stop_sequence";

function mapStopReason(
  reason: string | undefined,
): StreamTranslatorState["pendingFinishReason"] {
  switch (reason as BedrockStopReason | undefined) {
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    case "content_filtered":
    case "guardrail_intervened":
      return "content_filter";
    case "end_turn":
    case "stop_sequence":
    case undefined:
      return "stop";
  }
}

function emitRunStarted(state: StreamTranslatorState): StreamChunk | null {
  if (state.hasEmittedRunStarted) return null;
  state.hasEmittedRunStarted = true;
  return {
    type: EventType.RUN_STARTED,
    runId: state.runId,
    threadId: state.threadId,
    parentRunId: state.parentRunId,
    model: state.model,
    timestamp: Date.now(),
  } as StreamChunk;
}

function emitTextStartIfNeeded(
  state: StreamTranslatorState,
): StreamChunk | null {
  if (state.hasEmittedTextStart) return null;
  state.hasEmittedTextStart = true;
  state.hasEmittedTextEnd = false;
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId: state.messageId,
    role: "assistant",
    model: state.model,
    timestamp: Date.now(),
  } as StreamChunk;
}

function emitTextEndIfOpen(state: StreamTranslatorState): StreamChunk | null {
  if (!state.hasEmittedTextStart || state.hasEmittedTextEnd) return null;
  state.hasEmittedTextEnd = true;
  state.hasEmittedTextStart = false;
  return {
    type: EventType.TEXT_MESSAGE_END,
    messageId: state.messageId,
    model: state.model,
    timestamp: Date.now(),
  } as StreamChunk;
}

// Translate a single Bedrock ConverseStream event into zero-or-more
// TanStack AI StreamChunk events, mutating `state` to track lifecycle so the
// caller's for-await loop stays simple.
export function* translateBedrockStreamEvent(
  event: ConverseStreamOutput,
  state: StreamTranslatorState,
): Generator<StreamChunk> {
  const started = emitRunStarted(state);
  if (started) yield started;

  if (event.messageStart) {
    // Bedrock signals the assistant message has begun; we defer
    // TEXT_MESSAGE_START until we actually see text so tool-only responses
    // don't produce empty text frames.
    return;
  }

  if (event.contentBlockStart?.start?.toolUse) {
    const tu = event.contentBlockStart.start.toolUse;
    const idx = event.contentBlockStart.contentBlockIndex ?? 0;
    const toolCallId = tu.toolUseId ?? `${state.runId}-tool-${idx}`;
    const toolName = tu.name ?? "";
    state.toolCalls.set(idx, { id: toolCallId, name: toolName, args: "" });
    // Close any open text block before tool calls start so the wire stays
    // strictly start/content/end ordered.
    const close = emitTextEndIfOpen(state);
    if (close) yield close;
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: toolName,
      toolName,
      parentMessageId: state.messageId,
      model: state.model,
      timestamp: Date.now(),
      index: idx,
    } as StreamChunk;
    return;
  }

  if (event.contentBlockDelta?.delta) {
    const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
    const delta = event.contentBlockDelta.delta;

    if (typeof delta.text === "string" && delta.text.length > 0) {
      const start = emitTextStartIfNeeded(state);
      if (start) yield start;
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: state.messageId,
        delta: delta.text,
        model: state.model,
        timestamp: Date.now(),
      } as StreamChunk;
      return;
    }

    if (delta.toolUse?.input != null) {
      const tool = state.toolCalls.get(idx);
      if (tool) {
        const partial = delta.toolUse.input;
        tool.args += partial;
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: tool.id,
          delta: partial,
          model: state.model,
          timestamp: Date.now(),
        } as StreamChunk;
      }
      return;
    }
  }

  if (event.contentBlockStop) {
    const idx = event.contentBlockStop.contentBlockIndex ?? 0;
    const tool = state.toolCalls.get(idx);
    if (tool) {
      let input: unknown;
      try {
        input = tool.args ? JSON.parse(tool.args) : {};
      } catch {
        input = { raw: tool.args };
      }
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId: tool.id,
        toolCallName: tool.name,
        toolName: tool.name,
        model: state.model,
        timestamp: Date.now(),
        input,
      } as StreamChunk;
      state.toolCalls.delete(idx);
    } else {
      const close = emitTextEndIfOpen(state);
      if (close) yield close;
    }
    return;
  }

  if (event.messageStop) {
    state.pendingFinishReason = mapStopReason(event.messageStop.stopReason);
    const close = emitTextEndIfOpen(state);
    if (close) yield close;
    return;
  }

  if (event.metadata) {
    yield emitRunFinished(state, event.metadata.usage);
    return;
  }

  const errChunk = errorChunkFor(event, state);
  if (errChunk) yield errChunk;
}

function emitRunFinished(
  state: StreamTranslatorState,
  usage: TokenUsage | undefined,
): StreamChunk {
  state.hasEmittedRunFinished = true;
  const finishReason = state.pendingFinishReason ?? "stop";
  state.pendingFinishReason = null;
  return {
    type: EventType.RUN_FINISHED,
    runId: state.runId,
    threadId: state.threadId,
    model: state.model,
    timestamp: Date.now(),
    finishReason,
    usage: usage
      ? {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        }
      : undefined,
  } as StreamChunk;
}

function errorChunkFor(
  event: ConverseStreamOutput,
  state: StreamTranslatorState,
): StreamChunk | null {
  if (event.internalServerException) {
    return errorChunk(
      state,
      event.internalServerException.message ?? "Internal server error",
      "internal",
    );
  }
  if (event.modelStreamErrorException) {
    return errorChunk(
      state,
      event.modelStreamErrorException.originalMessage ??
        event.modelStreamErrorException.message ??
        "Model stream error",
      "model_stream",
    );
  }
  if (event.throttlingException) {
    return errorChunk(
      state,
      event.throttlingException.message ?? "Throttling",
      "throttling",
    );
  }
  if (event.validationException) {
    return errorChunk(
      state,
      event.validationException.message ?? "Validation error",
      "validation",
    );
  }
  if (event.serviceUnavailableException) {
    return errorChunk(
      state,
      event.serviceUnavailableException.message ?? "Service unavailable",
      "service_unavailable",
    );
  }
  return null;
}

export function errorChunk(
  state: { runId: string; model: string },
  message: string,
  code?: string,
): StreamChunk {
  return {
    type: EventType.RUN_ERROR,
    runId: state.runId,
    model: state.model,
    timestamp: Date.now(),
    message,
    code,
    error: { message, code },
  } as StreamChunk;
}

// Close out the run when the stream ends without a `metadata` event (the
// happy path emits RUN_FINISHED inside the loop). Yields TEXT_MESSAGE_END
// first if a text block is still open — otherwise the UI would render a
// finished run with a dangling assistant message.
export function* finalizeStream(
  state: StreamTranslatorState,
): Generator<StreamChunk> {
  if (state.hasEmittedRunFinished) return;
  const closeText = emitTextEndIfOpen(state);
  if (closeText) yield closeText;
  yield emitRunFinished(state, undefined);
}

// Translate a non-streaming ConverseResponse content array into the same
// StreamChunk sequence the streaming path produces. Used by the
// ConverseCommand fallback so callers downstream don't need to care which
// path produced the events.
export function* translateConverseOutput(
  state: StreamTranslatorState,
  content: Array<ContentBlock>,
  stopReason: string | undefined,
  usage: TokenUsage | undefined,
): Generator<StreamChunk> {
  const started = emitRunStarted(state);
  if (started) yield started;

  for (const block of content) {
    if (typeof (block as { text?: string }).text === "string") {
      const text = (block as { text: string }).text;
      if (text) {
        const start = emitTextStartIfNeeded(state);
        if (start) yield start;
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: state.messageId,
          delta: text,
          model: state.model,
          timestamp: Date.now(),
        } as StreamChunk;
      }
      continue;
    }
    const tu = (
      block as {
        toolUse?: { toolUseId?: string; name?: string; input?: unknown };
      }
    ).toolUse;
    if (tu) {
      const close = emitTextEndIfOpen(state);
      if (close) yield close;
      const toolCallId = tu.toolUseId ?? `${state.runId}-tool`;
      const toolName = tu.name ?? "";
      const inputObj = tu.input;
      const inputStr =
        typeof inputObj === "string"
          ? inputObj
          : JSON.stringify(inputObj ?? {});
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: toolName,
        toolName,
        parentMessageId: state.messageId,
        model: state.model,
        timestamp: Date.now(),
        index: 0,
      } as StreamChunk;
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: inputStr,
        model: state.model,
        timestamp: Date.now(),
      } as StreamChunk;
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: toolName,
        toolName,
        model: state.model,
        timestamp: Date.now(),
        input:
          inputObj && typeof inputObj === "object"
            ? inputObj
            : { value: inputObj },
      } as StreamChunk;
    }
  }

  const close = emitTextEndIfOpen(state);
  if (close) yield close;

  state.pendingFinishReason = mapStopReason(stopReason);
  yield emitRunFinished(state, usage);
}
