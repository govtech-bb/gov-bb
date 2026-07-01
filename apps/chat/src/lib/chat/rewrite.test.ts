import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMiddleware } from "@tanstack/ai";
import { rewriteMetricsMiddleware } from "./rewrite.ts";

// Drive the hook directly with an injected sink — the same approach turn-log's
// test uses. The middleware ignores ctx.
const ctx = {} as never;
const usage = (p: number, c: number) =>
  ({ promptTokens: p, completionTokens: c, totalTokens: p + c }) as never;

test("forwards the model and token usage to the sink on usage", () => {
  const calls: Array<{ model: string; prompt: number; completion: number }> =
    [];
  const mw = rewriteMetricsMiddleware("rewrite-model", (model, u) =>
    calls.push({
      model,
      prompt: u.promptTokens,
      completion: u.completionTokens,
    }),
  ) as Required<Pick<ChatMiddleware, "onUsage">> & ChatMiddleware;

  mw.onUsage!(ctx, usage(40, 8));

  assert.deepEqual(calls, [
    { model: "rewrite-model", prompt: 40, completion: 8 },
  ]);
});
