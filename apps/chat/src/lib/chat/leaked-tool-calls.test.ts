import assert from "node:assert/strict";
import { test } from "node:test";
import { stripLeakedToolCalls } from "./leaked-tool-calls";

// Regression guard for the form-fill tool-call leak: Haiku sometimes WRITES the
// tool call into its text reply (on top of actually invoking it), e.g.
// `set_field({ fieldId: "x", value: "y" })`. The real invocation is a separate
// tool-call part; this leaked prose must never reach the chat bubble. See
// stripLeakedToolCalls in leaked-tool-calls.ts.

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
