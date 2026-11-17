import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configureJourney,
  flushJourney,
  trackPageview,
} from "@govtech-bb/analytics";
import { createAnswerTracker } from "./analytics.ts";

function recorder() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const tracker = createAnswerTracker((event, data) => {
    calls.push([event, data]);
  });
  return { calls, tracker };
}

type Tracker = ReturnType<typeof createAnswerTracker>;

// One useChat turn: loading starts, `during` runs the stream's callbacks, and
// loading ends.
function turn(tracker: Tracker, during: () => void = () => undefined) {
  tracker.loading(true);
  during();
  tracker.loading(false);
}

test("a question typed in the chat sends chat-submit: chat", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  assert.deepEqual(calls, [["chat-submit", { source: "chat" }]]);
});

test("a question from landing sends no chat-submit: landing sent it", () => {
  const { calls, tracker } = recorder();
  tracker.asked("landing");
  assert.deepEqual(calls, []);
  turn(tracker, tracker.replied);
  assert.deepEqual(calls, [
    ["chat-answer", { outcome: "answered", source: "landing", cited: false }],
  ]);
});

test("a reply sends one chat-answer: answered, when the turn ends", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  turn(tracker, () => {
    // onFinish fires once per model pass in a tool loop: wait for the turn.
    tracker.replied();
    tracker.replied();
    assert.equal(calls.length, 1);
  });
  tracker.loading(false);
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "answered", source: "chat", cited: false }],
  ]);
});

test("cited is true when the reply came with cited pages", () => {
  const { calls, tracker } = recorder();
  tracker.asked("landing");
  turn(tracker, () => {
    tracker.cited();
    tracker.replied();
  });
  assert.deepEqual(calls.at(-1), [
    "chat-answer",
    { outcome: "answered", source: "landing", cited: true },
  ]);
});

test("a failed request sends chat-answer: error, once", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  // The client can end an errored stream with onFinish too.
  turn(tracker, () => {
    tracker.replied();
    tracker.failed();
  });
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "error", source: "chat", cited: false }],
  ]);
});

test("a turn that ends with no reply text sends chat-answer: error", () => {
  // e.g. the server's turn timeout fires before the first word: useChat calls
  // neither onFinish nor onError.
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  turn(tracker);
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "error", source: "chat", cited: false }],
  ]);
});

test("stopping or clearing mid-reply sends chat-answer: stopped", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  turn(tracker, () => {
    tracker.replied();
    tracker.stopped();
  });
  // A stop after the turn ended sends nothing more.
  tracker.stopped();
  assert.deepEqual(calls.slice(1), [
    ["chat-answer", { outcome: "stopped", source: "chat", cited: false }],
  ]);
});

test("turns that are not questions (retries, field answers) send nothing", () => {
  const { calls, tracker } = recorder();
  turn(tracker, () => {
    tracker.cited();
    tracker.replied();
    tracker.failed();
    tracker.stopped();
  });
  assert.deepEqual(calls, []);
});

test("citations from an earlier reply do not carry over to the next one", () => {
  const { calls, tracker } = recorder();
  tracker.asked("chat");
  turn(tracker, () => {
    tracker.cited();
    tracker.replied();
  });
  tracker.asked("chat");
  turn(tracker, tracker.replied);
  assert.deepEqual(calls.at(-1), [
    "chat-answer",
    { outcome: "answered", source: "chat", cited: false },
  ]);
});

test("one chat-answer per chat-submit across a conversation", () => {
  const { calls, tracker } = recorder();
  tracker.asked("landing");
  turn(tracker, () => {
    tracker.cited();
    tracker.replied();
  });
  tracker.asked("chat");
  turn(tracker, tracker.failed);
  tracker.asked("chat");
  turn(tracker);
  tracker.asked("chat");
  turn(tracker, tracker.stopped);
  const count = (name: string, source: string) =>
    calls.filter(([e, data]) => e === name && data.source === source).length;
  // Questions typed here: one chat-submit and one chat-answer each.
  assert.equal(count("chat-submit", "chat"), 3);
  assert.equal(count("chat-answer", "chat"), 3);
  // The landing question: its chat-submit was sent on landing, not here.
  assert.equal(count("chat-submit", "landing"), 0);
  assert.equal(count("chat-answer", "landing"), 1);
});

test("nothing sent to Umami or /journey carries the question or the answer", () => {
  const question = "my NIS number is 123456 and my name is Jane Doe";
  const sent: string[] = [];
  // A browser on the chat page, with landing's question in ?q=.
  const location = new URL(
    `https://chat.example.test/?q=${encodeURIComponent(question)}`,
  );
  const g = globalThis as Record<string, unknown>;
  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  g.window = {
    location,
    addEventListener: () => undefined,
    umami: {
      // Umami calls this with the payload it built; the worst case keeps the
      // query in the URL.
      track: (fn: (p: Record<string, unknown>) => unknown) =>
        sent.push(JSON.stringify(fn({ url: location.href, referrer: "" }))),
    },
  };
  g.location = location;
  g.document = { addEventListener: () => undefined };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { sendBeacon: (_url: string, body: string) => sent.push(body) > 0 },
  });
  try {
    configureJourney({ url: "https://api.example.test/journey", app: "chat" });
    trackPageview();
    const tracker = createAnswerTracker();
    tracker.asked("landing");
    turn(tracker, () => {
      tracker.cited();
      tracker.replied();
    });
    tracker.asked("chat");
    turn(tracker, tracker.failed);
    flushJourney();
  } finally {
    delete g.window;
    delete g.location;
    delete g.document;
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator);
  }

  const all = sent.join("\n");
  // The events did go out, to both Umami and /journey...
  assert.match(all, /chat-answer/);
  assert.ok(sent.length >= 2);
  // ...with no word of the question, in data, path or URL.
  for (const word of ["NIS", "123456", "Jane", "Doe", "q="]) {
    assert.ok(!all.includes(word), `sent "${word}"`);
  }
});
