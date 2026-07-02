import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTurnMetrics, buildRewriteMetrics } from "./turn-metrics.ts";
import type { TurnRecord } from "./turn-log.ts";

const base: TurnRecord = { model: "claude-haiku-4-5", userChars: 10 };

test("declares the metric set under GovBB/Chat, dimensioned by Model", () => {
  const doc = buildTurnMetrics(base, 1000);
  const block = doc._aws.CloudWatchMetrics[0];
  assert.equal(block.Namespace, "GovBB/Chat");
  assert.deepEqual(block.Dimensions, [["Model"]]);
  assert.deepEqual(
    block.Metrics.map((m) => m.Name),
    [
      "TurnDurationMs",
      "PromptTokens",
      "CompletionTokens",
      "TurnErrors",
      "TurnsCancelled",
      "RetrieveDegraded",
      "ToolFailures",
    ],
  );
  assert.equal(doc._aws.Timestamp, 1000);
});

test("maps a TurnRecord onto values — flags become 0/1, counts default to 0", () => {
  const doc = buildTurnMetrics(
    {
      ...base,
      durationMs: 1200,
      promptTokens: 50,
      completionTokens: 20,
      error: "boom",
      retrieveDegraded: true,
      toolFailures: 2,
    },
    0,
  );
  assert.equal(doc.Model, "claude-haiku-4-5");
  assert.equal(doc.TurnDurationMs, 1200);
  assert.equal(doc.PromptTokens, 50);
  assert.equal(doc.CompletionTokens, 20);
  assert.equal(doc.TurnErrors, 1);
  assert.equal(doc.TurnsCancelled, 0);
  assert.equal(doc.RetrieveDegraded, 1);
  assert.equal(doc.ToolFailures, 2);
});

test("a clean turn reports zeros, not undefined", () => {
  const doc = buildTurnMetrics(base, 0);
  assert.equal(doc.TurnErrors, 0);
  assert.equal(doc.TurnsCancelled, 0);
  assert.equal(doc.RetrieveDegraded, 0);
  assert.equal(doc.ToolFailures, 0);
  assert.equal(doc.PromptTokens, 0);
});

test("rewrite metrics: distinct names under GovBB/Chat, dimensioned by Model", () => {
  const doc = buildRewriteMetrics(
    "rewrite-model",
    { promptTokens: 40, completionTokens: 8 },
    1000,
  );
  const block = doc._aws.CloudWatchMetrics[0];
  assert.equal(block.Namespace, "GovBB/Chat");
  assert.deepEqual(block.Dimensions, [["Model"]]);
  assert.deepEqual(
    block.Metrics.map((m) => m.Name),
    ["RewritePromptTokens", "RewriteCompletionTokens"],
  );
  assert.equal(doc._aws.Timestamp, 1000);
  assert.equal(doc.Model, "rewrite-model");
  assert.equal(doc.RewritePromptTokens, 40);
  assert.equal(doc.RewriteCompletionTokens, 8);
});
