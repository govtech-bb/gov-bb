import { useRef } from "react";

/**
 * The value while there is one, and then the last one, so a popup or dialog that closes can keep showing what it
 * showed while it animates away. Pass null when it closes.
 */
export function useLatched<T>(value: T | null): T | null {
  const last = useRef(value);

  if (value !== null) last.current = value;

  return value ?? last.current;
}
