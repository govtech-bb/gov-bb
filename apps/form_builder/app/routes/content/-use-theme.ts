import { useEffect } from "react";
import { usePersistedState } from "./-use-persisted";

export type Theme = "light" | "dark";

/**
 * Light/dark theme for the content CMS, persisted across sessions. The choice
 * lands as `data-theme` on <html>, which the stylesheet's token overrides key
 * on — only this app's `--el-*`/`--txt*` tokens react to it, so the builder
 * is unaffected.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = usePersistedState<Theme>(
    "content-cms:theme",
    "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };
}
