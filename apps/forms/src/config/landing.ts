// Single source of truth for the landing-site origin every "go home"
// affordance in the forms app links back to (header logo, footer Home/Terms).
// Exposed to the bundle via Vite's `VITE_*` auto-discovery on
// `import.meta.env` — no `define` plumbing needed. Defaults to prod so a
// missing var degrades to a real prod link, not a self-link back into the
// forms app at e.g. `forms.alpha.gov.bb/`. Trailing slash stripped so callers
// append paths cleanly. Closes #1357.
export const LANDING_URL = (
  import.meta.env.VITE_LANDING_URL || "https://alpha.gov.bb"
).replace(/\/+$/, "");
