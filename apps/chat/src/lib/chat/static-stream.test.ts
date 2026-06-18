import assert from "node:assert/strict";
import { test } from "node:test";
import { staticAnswerStream } from "./static-stream.ts";

async function collect(
  gen: AsyncIterable<{ type: string; [k: string]: unknown }>,
) {
  const out: Array<{ type: string; [k: string]: unknown }> = [];
  for await (const c of gen) out.push(c);
  return out;
}

test("emits the canonical text-turn sequence", async () => {
  const chunks = await collect(
    staticAnswerStream("Sorry, off topic.", {
      threadId: "t1",
      runId: "r1",
      model: "claude-haiku-4-5",
    }),
  );
  assert.deepEqual(
    chunks.map((c) => c.type),
    [
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ],
  );
});

test("carries the text as the single content delta, with one stable messageId", async () => {
  const chunks = await collect(
    staticAnswerStream("Hello.", { threadId: "t1", model: "m" }),
  );
  const content = chunks.find((c) => c.type === "TEXT_MESSAGE_CONTENT")!;
  assert.equal(content.delta, "Hello.");
  const start = chunks.find((c) => c.type === "TEXT_MESSAGE_START")!;
  const end = chunks.find((c) => c.type === "TEXT_MESSAGE_END")!;
  assert.equal(start.messageId, content.messageId);
  assert.equal(end.messageId, content.messageId);
  assert.equal(
    chunks.find((c) => c.type === "RUN_FINISHED")!.finishReason,
    "stop",
  );
});

test("synthesises a runId when none is supplied", async () => {
  const chunks = await collect(
    staticAnswerStream("x", { threadId: "t1", model: "m" }),
  );
  const started = chunks.find((c) => c.type === "RUN_STARTED")!;
  assert.equal(typeof started.runId, "string");
  assert.ok((started.runId as string).length > 0);
});
