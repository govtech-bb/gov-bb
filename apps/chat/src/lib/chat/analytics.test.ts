import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnswerTracker } from "./analytics.ts";

function recorder() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const tracker = createAnswerTracker((event, data) => {
    calls.push([event, data]);
  });
  return { calls, tracker };
}

test("a question sends chat-submit with where it was asked", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  tracker.asked("landing");
  assert.deepEqual(calls, [
    ["chat-submit", { source: "chat" }],
    ["chat-submit", { source: "landing" }],
  ]);
});

test("a finished reply sends one chat-answer: answered", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  tracker.finished();
  // A second stream end in the same turn (e.g. the client's own finalize after
  // RUN_FINISHED) must not send a second answer.
  tracker.finished();
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "answered", source: "none" }],
  ]);
});

test("source is citations when the reply came with cited pages", () => {
  const { calls, tracker } = recorder();
  tracker.asked("landing");
  tracker.cited();
  tracker.finished();
  assert.deepEqual(calls.at(-1), [
    "chat-answer",
    { outcome: "answered", source: "citations" },
  ]);
});

test("a failed request sends chat-answer: error, once", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  tracker.failed();
  tracker.finished();
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "error", source: "none" }],
  ]);
});

test("stopping or clearing mid-reply sends chat-answer: stopped", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  tracker.stopped();
  // A stop after the reply already finished sends nothing more.
  tracker.stopped();
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "stopped", source: "none" }],
  ]);
});

test("turns that are not questions (retries, pill answers) send nothing", () => {
  const { calls, tracker } = recorder();
  tracker.cited();
  tracker.finished();
  tracker.failed();
  tracker.stopped();
  assert.deepEqual(calls, []);
});

test("citations from an earlier reply do not carry over to the next one", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  tracker.cited();
  tracker.finished();
  tracker.asked("chat");
  tracker.finished();
  assert.deepEqual(calls.at(-1), [
    "chat-answer",
    { outcome: "answered", source: "none" },
  ]);
});

test("one chat-answer per chat-submit across a conversation", () => {
  const { calls, tracker } = recorder();
  tracker.asked("landing");
  tracker.cited();
  tracker.finished();
  tracker.asked("chat");
  tracker.failed();
  tracker.asked("chat");
  tracker.stopped();
  const count = (name: string) => calls.filter(([e]) => e === name).length;
  assert.equal(count("chat-submit"), 3);
  assert.equal(count("chat-answer"), 3);
});

test("only source and outcome are sent, never question or answer text", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  tracker.cited();
  tracker.finished();
  assert.deepEqual(
    calls.map(([, data]) => Object.keys(data)),
    [["source"], ["outcome", "source"]],
  );
});
