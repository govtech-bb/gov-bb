import assert from "node:assert/strict";
import { test } from "node:test";
import type { StreamChunk } from "@tanstack/ai";
import { withStreamTimeout, type Scheduler } from "./stream-timeout.ts";

const chunk = (type: string): StreamChunk => ({ type }) as never;

async function* fromArray(items: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const item of items) yield item;
}

// A scheduler we can fire on demand, and that records whether it was cleared.
function manualScheduler() {
  let fire: (() => void) | null = null;
  let cleared = false;
  const schedule: Scheduler = (cb) => {
    fire = cb;
    return {
      clear: () => {
        cleared = true;
      },
    };
  };
  return {
    schedule,
    fire: () => fire?.(),
    get cleared() {
      return cleared;
    },
  };
}

test("passes every chunk through in order", async () => {
  const ac = new AbortController();
  const m = manualScheduler();
  const out: string[] = [];
  for await (const c of withStreamTimeout(
    fromArray([chunk("RUN_STARTED"), chunk("TEXT_MESSAGE_CONTENT")]),
    ac,
    1000,
    m.schedule,
  )) {
    out.push((c as { type: string }).type);
  }
  assert.deepEqual(out, ["RUN_STARTED", "TEXT_MESSAGE_CONTENT"]);
  assert.equal(ac.signal.aborted, false);
});

test("clears the timer once the stream drains normally", async () => {
  const ac = new AbortController();
  const m = manualScheduler();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of withStreamTimeout(
    fromArray([chunk("RUN_FINISHED")]),
    ac,
    1000,
    m.schedule,
  )) {
    // drain
  }
  assert.equal(m.cleared, true);
  assert.equal(ac.signal.aborted, false);
});

test("aborts the controller when the timeout fires mid-stream", async () => {
  const ac = new AbortController();
  const m = manualScheduler();
  // A stream that parks after the first chunk until we release it.
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  async function* parking(): AsyncGenerator<StreamChunk> {
    yield chunk("TEXT_MESSAGE_START");
    await gate;
    yield chunk("TEXT_MESSAGE_CONTENT");
  }

  const seen: string[] = [];
  const consume = (async () => {
    for await (const c of withStreamTimeout(parking(), ac, 5, m.schedule)) {
      seen.push((c as { type: string }).type);
      if (seen.length === 1) {
        m.fire(); // timeout elapses while the stream is parked
        assert.equal(ac.signal.aborted, true);
        release(); // let the underlying stream finish so we don't hang
      }
    }
  })();

  await consume;
  assert.equal(ac.signal.aborted, true);
  assert.equal(m.cleared, true);
});
