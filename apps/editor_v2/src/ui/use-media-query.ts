import { useSyncExternalStore } from "react";

/**
 * The theme's xl, 1200px: wide enough for a document's settings panel beside its canvas, and for the tools in its bar
 * to show their names. Narrower, the panel is a drawer and the tools are their icons.
 */
export const wideScreen = "(min-width: 75rem)";

/** Whether the media query matches, kept current as the window changes. False on the server, which has no screen. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);

      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
