import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTurnMetrics } from "./turn-metrics";
import type { TurnRecord } from "./turn-log";

const base: TurnRecord = {
  ts: "2026-06-09T12:00:00.000Z",
  model: "haiku",
  userChars: 20,
  retrieved: [],
};

test("declared metric names all carry a value on the document", () => {
  const doc = buildTurnMetrics(base, 1000);
  const declared = doc._aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name);
  for (const name of declared) {
    assert.equal(
      typeof (doc as unknown as Record<string, unknown>)[name],
      "number",
      `metric ${name} missing from document`,
    );
  }
  assert.deepEqual(doc._aws.CloudWatchMetrics[0].Dimensions, [["Model"]]);
  assert.equal(doc.Model, "haiku");
  assert.equal(doc._aws.Timestamp, 1000);
});

test("maps outcomes to counters", () => {
  const doc = buildTurnMetrics(
    {
      ...base,
      durationMs: 4200,
      promptTokens: 900,
      completionTokens: 150,
      error: "boom",
      retrieveDegraded: true,
      toolCalls: [
        { tool: "set_field", ok: true, ms: 5 },
        { tool: "submit_form", ok: false, ms: 80 },
      ],
    },
    1000,
  );
  assert.equal(doc.TurnDurationMs, 4200);
  assert.equal(doc.PromptTokens, 900);
  assert.equal(doc.CompletionTokens, 150);
  assert.equal(doc.TurnErrors, 1);
  assert.equal(doc.TurnsCancelled, 0);
  assert.equal(doc.RetrieveDegraded, 1);
  assert.equal(doc.ToolFailures, 1);
});

test("cancelled turn is not an error", () => {
  const doc = buildTurnMetrics({ ...base, cancelled: true }, 1000);
  assert.equal(doc.TurnsCancelled, 1);
  assert.equal(doc.TurnErrors, 0);
});
