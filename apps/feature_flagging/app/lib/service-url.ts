import type { ServiceRow } from "./catalogue";

// Public origins the admin table links out to, baked at build time via vite's
// `define` (see vite.config.ts) — Amplify Compute doesn't pass console vars to
// the SSR Lambda at runtime, and these are read from the client bundle too.
// Unset (local dev) falls back to the docker-stack origins so localhost links
// stay on localhost; deployed builds MUST set both or links point at localhost.
const LANDING_URL = (
  process.env.LANDING_URL || "http://localhost:3000"
).replace(/\/+$/, "");
const FORMS_URL = (process.env.FORMS_URL || "http://localhost:4200").replace(
  /\/+$/,
  "",
);

/**
 * The public page a service row links to, or null when there's nothing to open:
 * - a landing page (`landingUrl`) → the content page on the landing site;
 * - else a form (`hasForm`) → the form on the forms app (slug is the formId);
 * - else (an orphan with neither) → null, so the row title stays plain text.
 */
export function buildServiceUrl(
  row: ServiceRow,
  landingBase: string,
  formsBase: string,
): string | null {
  if (row.landingUrl)
    return `${landingBase}/${landingPath(row.landingUrl, row.category)}`;
  if (row.hasForm) return `${formsBase}/forms/${row.slug}`;
  return null;
}

// The category-prefixed landing path. A nested content slug already carries its
// category (e.g. "health-and-emergency-services/stormready"), but a top-level
// slug is the bare leaf ("get-birth-certificate") and must have the category
// prepended to match the canonical landing URL.
function landingPath(landingUrl: string, category?: string): string {
  if (landingUrl.includes("/") || !category) return landingUrl;
  return `${category}/${landingUrl}`;
}

/** `buildServiceUrl` against the environment's baked base URLs. */
export function serviceUrl(row: ServiceRow): string | null {
  return buildServiceUrl(row, LANDING_URL, FORMS_URL);
}
