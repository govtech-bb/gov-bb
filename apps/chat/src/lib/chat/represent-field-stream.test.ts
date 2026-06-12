import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType } from "@tanstack/ai";
import { representFieldStream } from "./represent-field-stream";
import type { AskFieldSpec } from "./form/field-spec";

const spec: AskFieldSpec = {
  fieldId: "experience-rating",
  label: "How was your experience?",
  htmlType: "select",
  options: [
    { label: "Okay", value: "okay" },
    { label: "Poor", value: "poor" },
  ],
};

// The deterministic re-render must reach the client as a real ask_field turn:
// RUN_STARTED → TOOL_CALL_START(ask_field) → TOOL_CALL_END(result) →
// RUN_FINISHED, with the field spec on the tool RESULT (what bubble.tsx renders
// the option pills from). This is what lets options re-appear without the model.
test("representFieldStream emits a complete ask_field tool turn carrying the spec", async () => {
  const chunks: Array<{
    type: string;
    toolCallName?: string;
    result?: string;
    parentMessageId?: string;
    toolCallId?: string;
  }> = [];
  for await (const c of representFieldStream(spec, {
    threadId: "t1",
    model: "m",
  })) {
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
  assert.equal(start?.toolCallName, "ask_field");

  const end = chunks.find((c) => c.type === EventType.TOOL_CALL_END);
  const output = JSON.parse(end!.result!) as {
    ok: boolean;
    field: AskFieldSpec;
  };
  assert.equal(output.ok, true);
  assert.equal(output.field.fieldId, "experience-rating");
  assert.deepEqual(output.field.options, spec.options);
  // The tool-call part and its result must share a message so they bind.
  assert.equal(start?.parentMessageId !== undefined, true);
});

// runId is optional on the request; the stream still synthesises one.
test("representFieldStream synthesises a runId when none is given", async () => {
  const chunks: Array<{ type: string; runId?: string }> = [];
  for await (const c of representFieldStream(spec, {
    threadId: "t1",
    model: "m",
  })) {
    chunks.push(c as (typeof chunks)[number]);
  }
  const started = chunks.find((c) => c.type === EventType.RUN_STARTED);
  assert.ok(started?.runId && started.runId.length > 0);
});
