import type { StreamChunk } from "@tanstack/ai";

// A cancellable scheduled callback. Injectable so tests can fire the timeout
// deterministically instead of waiting on a real timer (mirrors embed.ts's
// injectable `send`).
export type Scheduler = (cb: () => void, ms: number) => { clear: () => void };

const defaultScheduler: Scheduler = (cb, ms) => {
  const timer = setTimeout(cb, ms);
  return { clear: () => clearTimeout(timer) };
};

// Wall-clock ceiling for a streaming turn. The framework already aborts on
// client disconnect (toServerSentEventsStream's `cancel()` → abortController),
// and the rewrite stage bounds itself; nothing caps a hung upstream once the
// main stream is in flight. This wraps the chat() iterable: a timer aborts the
// turn if the whole stream hasn't drained within `ms`, and is cleared the
// moment the stream finishes or the consumer stops early — so a normal turn
// leaves no dangling timer. Abort is cooperative: the SSE encoder checks
// `signal.aborted` between chunks and closes cleanly.
export async function* withStreamTimeout(
  stream: AsyncIterable<StreamChunk>,
  abortController: AbortController,
  ms: number,
  schedule: Scheduler = defaultScheduler,
): AsyncGenerator<StreamChunk> {
  const handle = schedule(() => abortController.abort(), ms);
  try {
    for await (const chunk of stream) {
      yield chunk;
    }
  } finally {
    handle.clear();
  }
}
