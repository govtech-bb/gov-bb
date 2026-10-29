import { useRef } from "react";

/** Retains the last non-null value for an exit transition. Pass null when closing. */
export function useLatched<T>(value: T | null): T | null {
  const last = useRef(value);

  if (value !== null) last.current = value;

  return value ?? last.current;
}
