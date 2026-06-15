import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "@tanstack/ai";
import {
  awaitingFieldAnswer,
  capMessageHistory,
  lastAssistantText,
  MAX_HISTORY_MESSAGES,
} from "./messages";

const msg = (role: "user" | "assistant", content: string): UIMessage =>
  ({
    id: `${role}-${content}`,
    role,
    parts: [{ type: "text", content }],
  }) as unknown as UIMessage;

test("lastAssistantText returns the most recent assistant message", () => {
  const h = [
    msg("user", "how do I apply?"),
    msg("assistant", "Here's the form. Anything else I can help with?"),
    msg("user", "no"),
  ];
  assert.equal(
    lastAssistantText(h),
    "Here's the form. Anything else I can help with?",
  );
});

test("lastAssistantText returns empty string when there is no assistant turn", () => {
  assert.equal(lastAssistantText([msg("user", "hi")]), "");
  assert.equal(lastAssistantText([]), "");
});

// capMessageHistory bounds how many turns reach the LLM (#973 cost-DoS guard).
const mkHistory = (n: number): UIMessage[] =>
  Array.from(
    { length: n },
    (_, i) =>
      ({
        id: String(i),
        role: i % 2 === 0 ? "user" : "assistant",
        parts: [{ type: "text", content: String(i) }],
      }) as unknown as UIMessage,
  );

test("capMessageHistory leaves a short history untouched", () => {
  const h = mkHistory(10);
  assert.equal(capMessageHistory(h), h);
});

test("capMessageHistory keeps only the most recent MAX_HISTORY_MESSAGES", () => {
  const h = mkHistory(MAX_HISTORY_MESSAGES + 6);
  const capped = capMessageHistory(h);
  assert.equal(capped.length, MAX_HISTORY_MESSAGES);
  // Keeps the tail (live context), drops the oldest, preserves order.
  assert.equal(capped[0].id, "6");
  assert.equal(capped.at(-1)!.id, String(MAX_HISTORY_MESSAGES + 5));
});

test("capMessageHistory honours a custom max", () => {
  assert.equal(capMessageHistory(mkHistory(50), 5).length, 5);
  assert.equal(capMessageHistory(mkHistory(3), 5).length, 3);
});

// Mode-aware composer: a trailing assistant ask_field means the assistant is
// the one asking — the placeholder must not say "Ask a question...".
test("awaitingFieldAnswer is true only on a trailing assistant ask_field", () => {
  const askMsg = {
    id: "a1",
    role: "assistant",
    parts: [{ type: "tool-call", name: "ask_field", state: "complete" }],
  } as unknown as UIMessage;
  const userMsg = {
    id: "u1",
    role: "user",
    parts: [{ type: "text", content: "Aaron" }],
  } as unknown as UIMessage;
  assert.equal(awaitingFieldAnswer([userMsg, askMsg]), true);
  // The user already answered — back to normal mode.
  assert.equal(awaitingFieldAnswer([askMsg, userMsg]), false);
  assert.equal(awaitingFieldAnswer([]), false);
});
