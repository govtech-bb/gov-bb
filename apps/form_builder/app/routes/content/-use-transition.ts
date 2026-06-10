import { useRef, useState } from "react";

/**
 * Presence state for the open/close transition pattern (modal, dropdown):
 * the element mounts at its pre-open rest state, gets `.is-open` a frame
 * later so the open transition runs, and on close swaps to `.is-closing`,
 * staying mounted until the close duration (read live from the CSS token)
 * has elapsed.
 */
export function useTransitionPresence(closeDurVar: string): {
  mounted: boolean;
  cls: string;
  isOpen: boolean;
  open: () => void;
  close: () => void;
} {
  const [mounted, setMounted] = useState(false);
  const [cls, setCls] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    setMounted(true);
    setCls("");
    // Double rAF: the first frame paints the pre-open rest state, the second
    // adds .is-open so the transition actually tweens.
    requestAnimationFrame(() => requestAnimationFrame(() => setCls("is-open")));
  };

  const close = () => {
    setCls("is-closing");
    const ms =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          closeDurVar,
        ),
      ) || 150;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMounted(false);
      setCls("");
    }, ms);
  };

  return { mounted, cls, isOpen: cls === "is-open", open, close };
}
