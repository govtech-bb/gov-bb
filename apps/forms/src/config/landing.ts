import { requireEnv } from "./env";

// Single source of truth for the landing-site origin every "go home"
// affordance in the forms app links back to (header logo, footer Home/Terms).
// Exposed to the bundle via Vite's `VITE_*` auto-discovery on
// `import.meta.env` — no `define` plumbing needed. REQUIRED in production —
// a missing var fails fast (#1366) rather than silently linking a non-prod
// build at prod; in dev it defaults to https://alpha.gov.bb. Trailing slash
// stripped so callers append paths cleanly. Closes #1357.
export const LANDING_URL = requireEnv(
  import.meta.env.VITE_LANDING_URL,
  "VITE_LANDING_URL",
  "https://alpha.gov.bb",
).replace(/\/+$/, "");
