/**
 * Wrap an async loader in a single-slot TTL cache. The returned function serves
 * the last result until `ttlMs` has elapsed since it was produced, then
 * refetches on the next call. No request coalescing: concurrent calls on a cold
 * cache each invoke `fn` (matching the hand-rolled caches this replaces).
 */
export function ttlCache<T>(
  fn: () => Promise<T>,
  ttlMs: number,
): () => Promise<T> {
  let cache: { data: T; expiresAt: number } | null = null;
  return async () => {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
      return cache.data;
    }
    const data = await fn();
    cache = { data, expiresAt: now + ttlMs };
    return data;
  };
}
