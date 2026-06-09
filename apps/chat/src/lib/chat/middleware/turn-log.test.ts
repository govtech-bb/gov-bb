import assert from "node:assert/strict";
import { test } from "node:test";
import { toEmf, type TurnRecord } from "./turn-log";

const baseRecord: TurnRecord = {
  ts: "2026-06-09T20:00:00Z",
  model: "claude-haiku",
  userChars: 50,
  retrieved: [],
};

test("toEmf places metrics in GovBB/Chat namespace with Service dimension", () => {
  const emf = toEmf({
    ...baseRecord,
    promptTokens: 1234,
    completionTokens: 567,
    durationMs: 4321,
    retrieveDegraded: false,
  });

  const aws = emf._aws as {
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{ Name: string; Unit: string }>;
    }>;
  };
  assert.equal(aws.CloudWatchMetrics[0].Namespace, "GovBB/Chat");
  assert.deepEqual(aws.CloudWatchMetrics[0].Dimensions, [["Service"]]);
  assert.equal(emf.Service, "chat");

  const metricNames = aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name);
  assert.deepEqual(metricNames, [
    "ChatTurn.LatencyMs",
    "ChatTurn.LlmInputTokens",
    "ChatTurn.LlmOutputTokens",
    "ChatTurn.RetrievalDegraded",
  ]);
});

test("toEmf emits all 4 metric values when all fields are present", () => {
  const emf = toEmf({
    ...baseRecord,
    promptTokens: 1234,
    completionTokens: 567,
    durationMs: 4321,
    retrieveDegraded: false,
  });

  assert.equal(emf["ChatTurn.LatencyMs"], 4321);
  assert.equal(emf["ChatTurn.LlmInputTokens"], 1234);
  assert.equal(emf["ChatTurn.LlmOutputTokens"], 567);
  assert.equal(emf["ChatTurn.RetrievalDegraded"], 0);
});

test("toEmf omits LatencyMs and token metrics when those fields are undefined", () => {
  const emf = toEmf({
    ...baseRecord,
    // No promptTokens, no completionTokens, no durationMs
    // (e.g. LLM aborted mid-stream before RUN_FINISHED with usage)
  });

  assert.equal(emf["ChatTurn.LatencyMs"], undefined);
  assert.equal(emf["ChatTurn.LlmInputTokens"], undefined);
  assert.equal(emf["ChatTurn.LlmOutputTokens"], undefined);
  // RetrievalDegraded always emitted (0 when false/undefined, 1 when true)
  assert.equal(emf["ChatTurn.RetrievalDegraded"], 0);
});

test("toEmf reports retrieveDegraded=true as metric value 1", () => {
  const emf = toEmf({ ...baseRecord, retrieveDegraded: true });
  assert.equal(emf["ChatTurn.RetrievalDegraded"], 1);
});

test("toEmf preserves non-metric fields for log searchability", () => {
  const emf = toEmf({
    ...baseRecord,
    threadId: "t-abc",
    runId: "r-xyz",
    query: "how do I register a birth?",
    formSlug: "register-a-birth",
    finishReason: "stop",
    cancelled: false,
    toolCalls: [{ tool: "set_field", ok: true, ms: 12 }],
  });

  assert.equal(emf.ts, "2026-06-09T20:00:00Z");
  assert.equal(emf.threadId, "t-abc");
  assert.equal(emf.runId, "r-xyz");
  assert.equal(emf.model, "claude-haiku");
  assert.equal(emf.query, "how do I register a birth?");
  assert.equal(emf.formSlug, "register-a-birth");
  assert.equal(emf.finishReason, "stop");
  assert.equal(emf.cancelled, false);
  assert.deepEqual(emf.toolCalls, [{ tool: "set_field", ok: true, ms: 12 }]);
});
