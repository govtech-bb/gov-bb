import { useEffect, useLayoutEffect } from "react";
import { usePersistedState } from "./use-persisted-state";

export type Theme = "light" | "dark";
const useThemeEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Shared appearance for GovTech UI and the existing builder screens. */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = usePersistedState<Theme>(
    "content-cms:theme",
    "light",
  );

  useThemeEffect(() => {
    // A theme change should not trigger every control's hover transition.
    const reset = document.createElement("style");
    reset.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.append(reset);
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = theme;
    document.documentElement.getBoundingClientRect();
    const frame = requestAnimationFrame(() => reset.remove());
    return () => {
      cancelAnimationFrame(frame);
      reset.remove();
    };
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };
}
