import assert from "node:assert/strict";
import { test } from "node:test";
import { lastUserText, messageText, recentHistory } from "./messages.ts";

test("messageText returns string content, empty for non-string", () => {
  assert.equal(messageText({ role: "user", content: "hi" }), "hi");
  assert.equal(messageText({ role: "user", content: [{ type: "text" }] }), "");
  assert.equal(messageText(undefined), "");
});

test("lastUserText returns the most recent user message", () => {
  const msgs = [
    { role: "user", content: "first" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "second" },
  ];
  assert.equal(lastUserText(msgs), "second");
  assert.equal(lastUserText([{ role: "assistant", content: "x" }]), "");
});

test("recentHistory excludes the latest, caps lines, handles empty", () => {
  assert.equal(
    recentHistory([{ role: "user", content: "only" }]),
    "(no prior turns)",
  );
  const h = recentHistory([
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "q2" },
  ]);
  assert.equal(h, "user: q1\nassistant: a1");
});
