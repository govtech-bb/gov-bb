import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType } from "@tanstack/ai";
import { blockedMessageStream } from "./blocked-stream";

// A blocked turn must reach the client as a normal assistant text message
// (RUN_STARTED → TEXT_MESSAGE_START → _CONTENT → _END → RUN_FINISHED) carrying
// the refusal text — so the UI renders it like any reply, not an error pill.
test("blockedMessageStream emits a well-formed assistant text turn", async () => {
  const msg = "I can only help with Barbados government services.";
  const chunks = [];
  for await (const c of blockedMessageStream(msg, {
    threadId: "t1",
    model: "test-model",
  })) {
    chunks.push(c as { type: string; delta?: string; role?: string });
  }

  assert.deepEqual(
    chunks.map((c) => c.type),
    [
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ],
  );

  const content = chunks.find((c) => c.type === EventType.TEXT_MESSAGE_CONTENT);
  assert.equal(content?.delta, msg);

  const start = chunks.find((c) => c.type === EventType.TEXT_MESSAGE_START);
  assert.equal(start?.role, "assistant");
});

// runId is optional on the request; the stream must still produce one so the
// client can correlate RUN_STARTED/RUN_FINISHED.
test("blockedMessageStream synthesises a runId when none is given", async () => {
  const chunks = [];
  for await (const c of blockedMessageStream("x", {
    threadId: "t1",
    model: "m",
  })) {
    chunks.push(c as { type: string; runId?: string });
  }
  const started = chunks.find((c) => c.type === EventType.RUN_STARTED);
  assert.ok(started?.runId && started.runId.length > 0);
});
