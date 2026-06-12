import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMiddlewareContext, StreamChunk } from "@tanstack/ai";
import { toolCallGuardMiddleware } from "./tool-call-guard";

const ctx = {} as ChatMiddlewareContext;

function content(delta: string): StreamChunk {
  return {
    type: "TEXT_MESSAGE_CONTENT",
    messageId: "m1",
    delta,
    timestamp: 0,
  } as StreamChunk;
}

const end = {
  type: "TEXT_MESSAGE_END",
  messageId: "m1",
  timestamp: 0,
} as StreamChunk;

// Run chunks through the middleware, returning the concatenated text the
// client would see.
async function emittedText(chunks: StreamChunk[]): Promise<string> {
  const mw = toolCallGuardMiddleware();
  let out = "";
  for (const chunk of chunks) {
    const result = await mw.onChunk!(ctx, chunk);
    const emitted =
      result === null || result === undefined
        ? []
        : Array.isArray(result)
          ? result
          : [result];
    for (const c of emitted) {
      if (c.type === "TEXT_MESSAGE_CONTENT") out += c.delta;
    }
  }
  return out;
}

test("strips a leaked tool call even when split across deltas", async () => {
  const text = await emittedText([
    content("Saved! set_field({ fieldId"),
    content(': "school", value: "St. Giles" }) What is the '),
    content("child's date of birth?"),
    end,
  ]);
  assert.ok(!text.includes("set_field"), `leak survived: ${text}`);
  assert.ok(text.includes("Saved!"));
  assert.ok(text.includes("What is the child's date of birth?"));
});

test("passes clean text through unchanged", async () => {
  const text = await emittedText([
    content("You can apply for a school "),
    content("textbook grant online."),
    end,
  ]);
  assert.equal(text, "You can apply for a school textbook grant online.");
});

test("strips a fenced tool call", async () => {
  const text = await emittedText([
    content("Done.\n```js\nsubmit_form()\n```\nAnything else?"),
    end,
  ]);
  assert.ok(!text.includes("submit_form"), `leak survived: ${text}`);
  assert.ok(text.includes("Anything else?"));
});
