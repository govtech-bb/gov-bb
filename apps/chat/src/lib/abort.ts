export function childController(
  parent: AbortSignal,
  timeoutMs?: number,
): AbortController {
  const ac = new AbortController();
  const combined = timeoutMs
    ? AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)])
    : parent;
  if (combined.aborted) ac.abort();
  else combined.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}

export function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}
