// A child AbortController that fires when the parent signal aborts OR an
// optional timeout elapses. `AbortSignal.timeout`'s internal timer is unref'd
// and one-shot, so there's nothing to clear — no manual setTimeout/listener
// bookkeeping at the call site.
export function childController(
  parent?: AbortSignal,
  timeoutMs?: number,
): AbortController {
  const ac = new AbortController();
  const signals = [
    parent,
    timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  ].filter((s): s is AbortSignal => Boolean(s));
  if (signals.length === 0) return ac;
  const combined = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  if (combined.aborted) ac.abort();
  else combined.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}
