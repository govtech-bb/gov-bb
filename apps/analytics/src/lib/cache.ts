// Per-process in-memory TTL memo. Dedupes Umami calls across a refresh or two
// concurrent SSR requests without any persistence (no DB, no snapshot). Scope
// is one SSR (Lambda) instance; a cold start begins empty, which is fine — the
// first request repopulates it.
type Entry = { at: number; value: Promise<unknown> }
const store = new Map<string, Entry>()

export async function memoize<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>
  const value = fn().catch((err) => {
    // Don't cache failures — drop the entry so the next request retries.
    store.delete(key)
    throw err
  })
  store.set(key, { at: Date.now(), value })
  return value as Promise<T>
}

/** test-only: reset the memo between cases. */
export function __clearCache() {
  store.clear()
}
