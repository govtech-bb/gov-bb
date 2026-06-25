import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMiddleware } from "@tanstack/ai";
import { turnLogMiddleware, type TurnRecord } from "./turn-log.ts";

// Minimal fakes — the middleware ignores ctx; we drive the hooks directly.
const ctx = {} as never;
const usage = (p: number, c: number) =>
  ({ promptTokens: p, completionTokens: c, totalTokens: p + c }) as never;

function run(meta: Parameters<typeof turnLogMiddleware>[0]) {
  const records: TurnRecord[] = [];
  const mw = turnLogMiddleware(meta, Date.now(), (r) =>
    records.push(r),
  ) as Required<
    Pick<ChatMiddleware, "onChunk" | "onUsage" | "onFinish" | "onError">
  > &
    ChatMiddleware;
  return { mw, records };
}

test("logs one record with accumulated tokens, finishReason, duration", () => {
  const { mw, records } = run({ model: "claude-haiku-4-5", userChars: 12 });
  mw.onUsage!(ctx, usage(10, 20));
  mw.onUsage!(ctx, usage(5, 5));
  mw.onFinish!(ctx, { finishReason: "stop" } as never);
  assert.equal(records.length, 1);
  const r = records[0];
  assert.equal(r.model, "claude-haiku-4-5");
  assert.equal(r.userChars, 12);
  assert.equal(r.promptTokens, 15);
  assert.equal(r.completionTokens, 25);
  assert.equal(r.totalTokens, 40);
  assert.equal(r.finishReason, "stop");
  assert.equal(typeof r.durationMs, "number");
});

test("captures a RUN_ERROR chunk and reports it on the finish record", () => {
  const { mw, records } = run({ model: "m", userChars: 3 });
  mw.onChunk!(ctx, { type: "RUN_ERROR", message: "boom" } as never);
  mw.onFinish!(ctx, { finishReason: undefined } as never);
  assert.equal(records[0].error, "boom");
});

test("RUN_ERROR with code 'aborted' marks cancelled, not error", () => {
  const { mw, records } = run({ model: "m", userChars: 3 });
  mw.onChunk!(ctx, { type: "RUN_ERROR", code: "aborted" } as never);
  mw.onFinish!(ctx, { finishReason: undefined } as never);
  assert.equal(records[0].cancelled, true);
  assert.equal(records[0].error, undefined);
});

test("onAbort records a cancelled turn (timeout / disconnect)", () => {
  const { mw, records } = run({ model: "m", userChars: 3 });
  // The engine routes a cancelled run to onAbort, not onError/onFinish.
  mw.onAbort!(ctx, { duration: 1234 } as never);
  assert.equal(records.length, 1);
  assert.equal(records[0].cancelled, true);
  assert.equal(records[0].durationMs, 1234);
  assert.equal(records[0].error, undefined);
});

test("emits exactly one record even if onFinish and onError both fire", () => {
  const { mw, records } = run({ model: "m", userChars: 3 });
  mw.onFinish!(ctx, { finishReason: "stop" } as never);
  mw.onError!(ctx, { error: new Error("late") } as never);
  assert.equal(records.length, 1);
});

test("omits query when the caller doesn't provide it (no PII by default)", () => {
  const { mw, records } = run({ model: "m", userChars: 5 });
  mw.onFinish!(ctx, { finishReason: "stop" } as never);
  assert.equal("query" in records[0] && records[0].query !== undefined, false);
  // tokens absent when no usage was seen
  assert.equal(records[0].totalTokens, undefined);
});
