// Single source of truth for the landing-site origin every "go home"
// affordance points at (header logo, footer Home/Terms, Close). Baked at build
// time from process.env.LANDING_URL via vite's `define` (see vite.config.ts) —
// the same mechanism FORMS_URL uses, since Amplify Compute doesn't pass Console
// vars to the SSR Lambda at runtime. Defaults to prod; sandbox/preview builds
// set LANDING_URL explicitly. Trailing slash stripped so callers append paths
// cleanly.
export const LANDING_URL = (
  process.env.LANDING_URL || "https://alpha.gov.bb"
).replace(/\/+$/, "");
