import { useEffect, useState } from "react";

/**
 * `useState` persisted to localStorage. SSR-safe: renders the initial value,
 * then adopts the stored one after mount (storage isn't readable during SSR,
 * and reading it in the initializer would cause a hydration mismatch).
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((cur: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* corrupt/absent storage — keep the default */
    }
  }, [key]);

  const set = (next: T | ((cur: T) => T)) => {
    setValue((cur) => {
      const resolved =
        typeof next === "function" ? (next as (c: T) => T)(cur) : next;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* storage full/blocked — state still updates */
      }
      return resolved;
    });
  };

  return [value, set];
}
