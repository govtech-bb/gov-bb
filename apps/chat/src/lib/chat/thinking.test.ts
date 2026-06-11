import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "@tanstack/ai";
import { shouldShowThinking } from "./thinking";

function msg(
  role: "user" | "assistant",
  parts: Array<Record<string, unknown>>,
): UIMessage {
  return { id: "m", role, parts } as unknown as UIMessage;
}

test("thinking shows after a user message and on an empty assistant turn", () => {
  assert.equal(
    shouldShowThinking([msg("user", [{ type: "text", content: "hi" }])]),
    true,
  );
  // Assistant turn started but nothing renderable yet (e.g. only set_field).
  assert.equal(
    shouldShowThinking([
      msg("assistant", [{ type: "tool-call", name: "set_field" }]),
    ]),
    true,
  );
  assert.equal(shouldShowThinking([]), false);
});

test("thinking hides once text or a renderable tool call lands", () => {
  assert.equal(
    shouldShowThinking([
      msg("assistant", [{ type: "text", content: "Here's the answer" }]),
    ]),
    false,
  );
  for (const name of [
    "present_choices",
    "ask_field",
    "review_form",
    "submit_form",
    "offer_feedback",
  ]) {
    assert.equal(
      shouldShowThinking([msg("assistant", [{ type: "tool-call", name }])]),
      false,
      name,
    );
  }
});
