import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "@tanstack/ai";
import {
  awaitingFieldAnswer,
  capMessageHistory,
  lastAssistantText,
  MAX_HISTORY_MESSAGES,
  stripLeakedToolCalls,
} from "./messages";

const msg = (role: "user" | "assistant", content: string): UIMessage =>
  ({
    id: `${role}-${content}`,
    role,
    parts: [{ type: "text", content }],
  }) as unknown as UIMessage;

// Regression guard for the form-fill tool-call leak: Haiku sometimes WRITES the
// tool call into its text reply (on top of actually invoking it), e.g.
// `set_field({ fieldId: "x", value: "y" })`. The real invocation is a separate
// tool-call part; this leaked prose must never reach the chat bubble. See
// stripLeakedToolCalls in messages.ts.

test("strips a multi-line set_field call, keeps the trailing question", () => {
  const input =
    'set_field({\n  fieldId: "your_full_name",\n  value: "testie sandwich"\n})\n' +
    "What's your relationship to the person who has died?";
  assert.equal(
    stripLeakedToolCalls(input),
    "What's your relationship to the person who has died?",
  );
});

test("strips a tool call wrapped in a ``` code fence", () => {
  const input =
    '```\nset_field({ fieldId: "x", value: "y" })\n```\nGreat — what next?';
  assert.equal(stripLeakedToolCalls(input), "Great — what next?");
  const fencedLang = '```js\nset_field({fieldId:"a",value:"b"})\n```\nThanks!';
  assert.equal(stripLeakedToolCalls(fencedLang), "Thanks!");
});

test("strips submit_form() with no arguments", () => {
  assert.equal(
    stripLeakedToolCalls("Here's your review.\nsubmit_form()"),
    "Here's your review.",
  );
});

test("strips present_choices with an array argument", () => {
  const input =
    'present_choices({ question: "Type?", choices: ["A","B"] })\nPick one.';
  assert.equal(stripLeakedToolCalls(input), "Pick one.");
});

test("strips multiple set_field calls in one reply", () => {
  const input =
    'set_field({fieldId:"first",value:"testie"})\n' +
    'set_field({fieldId:"last",value:"sandwich"})\n' +
    "What is your relationship?";
  assert.equal(stripLeakedToolCalls(input), "What is your relationship?");
});

test("leaves legitimate prose untouched", () => {
  const a = "I'll record that for you now. What's your date of birth?";
  assert.equal(stripLeakedToolCalls(a), a);
  // Mentions the word but isn't a call (no parens) — must not be stripped.
  const b = "I use set_field internally but here is your question: name?";
  assert.equal(stripLeakedToolCalls(b), b);
});

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
