import type {
  ContentBlock,
  ConverseStreamOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type { StreamChunk } from "@tanstack/ai";
import {
  createTranslatorState,
  translateBedrockStreamEvent,
  translateConverseOutput,
} from "./stream";

function mkState() {
  return createTranslatorState({
    model: "claude-haiku-4-5",
    runId: "run-1",
    threadId: "thread-1",
    messageId: "msg-1",
  });
}

function run(events: Array<ConverseStreamOutput>): {
  state: ReturnType<typeof mkState>;
  chunks: Array<StreamChunk>;
} {
  const state = mkState();
  const chunks: Array<StreamChunk> = [];
  for (const ev of events) {
    for (const chunk of translateBedrockStreamEvent(ev, state)) {
      chunks.push(chunk);
    }
  }
  return { state, chunks };
}

describe("translateBedrockStreamEvent — text-only flow", () => {
  it("emits RUN_STARTED → TEXT_MESSAGE_START → CONTENT → END → RUN_FINISHED", () => {
    const { chunks } = run([
      { messageStart: { role: "assistant" } } as ConverseStreamOutput,
      {
        contentBlockDelta: {
          delta: { text: "Hello " },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      {
        contentBlockDelta: {
          delta: { text: "world" },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      { contentBlockStop: { contentBlockIndex: 0 } } as ConverseStreamOutput,
      { messageStop: { stopReason: "end_turn" } } as ConverseStreamOutput,
      {
        metadata: {
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          metrics: { latencyMs: 1 },
        },
      } as ConverseStreamOutput,
    ]);

    expect(chunks.map((c) => c.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);

    const content = chunks.filter(
      (c) => c.type === "TEXT_MESSAGE_CONTENT",
    ) as Array<{ delta: string }>;
    expect(content.map((c) => c.delta).join("")).toBe("Hello world");

    const finish = chunks[chunks.length - 1] as {
      finishReason: string;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    };
    expect(finish.finishReason).toBe("stop");
    expect(finish.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });
});

describe("translateBedrockStreamEvent — tool-call flow", () => {
  it("emits TOOL_CALL_START → ARGS* → END with parsed input", () => {
    const { chunks } = run([
      { messageStart: { role: "assistant" } } as ConverseStreamOutput,
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: "tu-1", name: "set_field" } },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"fieldId":' } },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '"name","value":"Alice"}' } },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      { contentBlockStop: { contentBlockIndex: 0 } } as ConverseStreamOutput,
      { messageStop: { stopReason: "tool_use" } } as ConverseStreamOutput,
      {
        metadata: {
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          metrics: { latencyMs: 1 },
        },
      } as ConverseStreamOutput,
    ]);

    expect(chunks.map((c) => c.type)).toEqual([
      "RUN_STARTED",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "RUN_FINISHED",
    ]);

    const end = chunks.find((c) => c.type === "TOOL_CALL_END") as {
      input: unknown;
      toolCallId: string;
      toolCallName: string;
    };
    expect(end.toolCallId).toBe("tu-1");
    expect(end.toolCallName).toBe("set_field");
    expect(end.input).toEqual({ fieldId: "name", value: "Alice" });

    const finish = chunks[chunks.length - 1] as { finishReason: string };
    expect(finish.finishReason).toBe("tool_calls");
  });

  it("falls back to { raw } when tool args don't parse", () => {
    const { chunks } = run([
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: "tu-1", name: "f" } },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      {
        contentBlockDelta: {
          delta: { toolUse: { input: "not-json" } },
          contentBlockIndex: 0,
        },
      } as ConverseStreamOutput,
      { contentBlockStop: { contentBlockIndex: 0 } } as ConverseStreamOutput,
    ]);
    const end = chunks.find((c) => c.type === "TOOL_CALL_END") as {
      input: unknown;
    };
    expect(end.input).toEqual({ raw: "not-json" });
  });
});

describe("translateBedrockStreamEvent — errors", () => {
  it("emits RUN_ERROR for throttling", () => {
    const { chunks } = run([
      {
        throttlingException: { message: "slow down" },
      } as ConverseStreamOutput,
    ]);
    const err = chunks.find((c) => c.type === "RUN_ERROR") as {
      message: string;
      code?: string;
    };
    expect(err.message).toBe("slow down");
    expect(err.code).toBe("throttling");
  });
});

describe("translateConverseOutput (non-streaming fallback)", () => {
  it("emits the same chunk sequence as the streaming path for text-only", () => {
    const state = mkState();
    const chunks = Array.from(
      translateConverseOutput(
        state,
        [{ text: "hi there" }] as unknown as Array<ContentBlock>,
        "end_turn",
        { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      ),
    );
    expect(chunks.map((c) => c.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
    const finish = chunks[chunks.length - 1] as { finishReason: string };
    expect(finish.finishReason).toBe("stop");
  });

  it("emits a synthetic TOOL_CALL sequence for tool-use-only responses", () => {
    const state = mkState();
    const chunks = Array.from(
      translateConverseOutput(
        state,
        [
          {
            toolUse: {
              toolUseId: "tu-9",
              name: "submit_form",
              input: { ok: true },
            },
          },
        ] as unknown as Array<ContentBlock>,
        "tool_use",
        undefined,
      ),
    );
    expect(chunks.map((c) => c.type)).toEqual([
      "RUN_STARTED",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "RUN_FINISHED",
    ]);
    const end = chunks.find((c) => c.type === "TOOL_CALL_END") as {
      input: unknown;
    };
    expect(end.input).toEqual({ ok: true });
  });
});
