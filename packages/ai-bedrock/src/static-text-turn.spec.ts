import type { StreamChunk } from "@tanstack/ai";
import { emitTextTurn, type TextTurnIds } from "./static-text-turn";

const ids: TextTurnIds = {
  runId: "run-1",
  threadId: "thread-1",
  messageId: "msg-1",
  model: "claude-haiku-4-5",
};

function run(
  text: string,
  overrides: Partial<TextTurnIds> = {},
): StreamChunk[] {
  return [...emitTextTurn(text, { ...ids, ...overrides })];
}

describe("emitTextTurn", () => {
  it("emits the canonical text-turn sequence", () => {
    const chunks = run("Hello.");
    expect(chunks.map((c) => c.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
  });

  it("threads runId/threadId/model through the run frames", () => {
    const chunks = run("Hello.");
    const started = chunks[0] as Extract<StreamChunk, { type: "RUN_STARTED" }>;
    const finished = chunks[4] as Extract<
      StreamChunk,
      { type: "RUN_FINISHED" }
    >;
    expect(started).toMatchObject({
      runId: "run-1",
      threadId: "thread-1",
      model: "claude-haiku-4-5",
    });
    expect(finished).toMatchObject({
      runId: "run-1",
      threadId: "thread-1",
      model: "claude-haiku-4-5",
      finishReason: "stop",
    });
  });

  it("carries the text as a single content delta under the supplied messageId", () => {
    const chunks = run("The whole reply.", { messageId: "msg-xyz" });
    const start = chunks[1] as Extract<
      StreamChunk,
      { type: "TEXT_MESSAGE_START" }
    >;
    const content = chunks[2] as Extract<
      StreamChunk,
      { type: "TEXT_MESSAGE_CONTENT" }
    >;
    const end = chunks[3] as Extract<StreamChunk, { type: "TEXT_MESSAGE_END" }>;
    expect(start.messageId).toBe("msg-xyz");
    expect(start.role).toBe("assistant");
    expect(content.messageId).toBe("msg-xyz");
    expect(content.delta).toBe("The whole reply.");
    expect(end.messageId).toBe("msg-xyz");
  });
});
