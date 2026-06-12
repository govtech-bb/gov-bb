import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType } from "@tanstack/ai";
import { representChoicesStream } from "./represent-choices-stream";

// The deterministic choices render must reach the client as a real
// present_choices turn: RUN_STARTED → TOOL_CALL_START(present_choices) →
// TOOL_CALL_END(args) → RUN_FINISHED, with {question, choices} on the tool-call
// ARGS (what bubble.tsx renders the pills from — not the result).
test("representChoicesStream emits a complete present_choices turn with args", async () => {
  const chunks: Array<{
    type: string;
    toolCallName?: string;
    input?: { question?: string; choices?: string[] };
    parentMessageId?: string;
  }> = [];
  for await (const c of representChoicesStream(
    "About this assistant or a service?",
    ["About this assistant", "About a service or the site"],
    { threadId: "t1", model: "m" },
  )) {
    chunks.push(c as (typeof chunks)[number]);
  }

  assert.deepEqual(
    chunks.map((c) => c.type),
    [
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ],
  );

  const start = chunks.find((c) => c.type === EventType.TOOL_CALL_START);
  assert.equal(start?.toolCallName, "present_choices");
  assert.equal(start?.parentMessageId !== undefined, true);

  const end = chunks.find((c) => c.type === EventType.TOOL_CALL_END);
  assert.equal(end?.input?.question, "About this assistant or a service?");
  assert.deepEqual(end?.input?.choices, [
    "About this assistant",
    "About a service or the site",
  ]);
});

test("representChoicesStream synthesises a runId when none is given", async () => {
  const chunks: Array<{ type: string; runId?: string }> = [];
  for await (const c of representChoicesStream("Q", ["a", "b"], {
    threadId: "t1",
    model: "m",
  })) {
    chunks.push(c as (typeof chunks)[number]);
  }
  const started = chunks.find((c) => c.type === EventType.RUN_STARTED);
  assert.ok(started?.runId && started.runId.length > 0);
});
