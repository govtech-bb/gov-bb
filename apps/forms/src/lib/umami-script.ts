import { UMAMI_SCRIPT_ATTRIBUTES } from "./analytics";

const DEFAULT_UMAMI_SRC = "https://cloud.umami.is/script.js";

/**
 * Add Umami Cloud's script to the page. Does nothing without a website id, so
 * environments that don't set VITE_UMAMI_WEBSITE_ID send nothing to Umami.
 * UMAMI_SCRIPT_ATTRIBUTES turns auto-tracking off (page views come from the
 * router subscriber in main.tsx) and keeps the query string, which carries
 * ?draft= and ?preview= tokens, out of the URLs Umami records.
 */
export function loadUmamiScript(
  websiteId: string | undefined,
  src: string | undefined,
): void {
  if (!websiteId) return;
  const script = document.createElement("script");
  script.src = src ?? DEFAULT_UMAMI_SRC;
  script.defer = true;
  script.setAttribute("data-website-id", websiteId);
  for (const [name, value] of Object.entries(UMAMI_SCRIPT_ATTRIBUTES)) {
    script.setAttribute(name, value);
  }
  document.head.appendChild(script);
}
