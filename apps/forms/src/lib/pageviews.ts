import type { AnyRouter } from "@tanstack/react-router";
import { trackPageview } from "./analytics";

/**
 * Count a page view on onRendered, so forms counts the same way as landing
 * (apps/landing/src/router.tsx says why landing left onResolved), but only
 * when the pathname changes, the first load included. Forms keeps the step
 * in the search params (?step=), and onRendered fires on every address
 * change, so counting each one would make every step a page view. A step-only change is
 * not a page view: form-step-view already records steps (#3504).
 */
export function trackPageviewsOnPathChange(router: AnyRouter): () => void {
  let lastPath: string | undefined;
  return router.subscribe("onRendered", ({ toLocation }) => {
    if (toLocation.pathname === lastPath) return;
    lastPath = toLocation.pathname;
    trackPageview();
  });
}
