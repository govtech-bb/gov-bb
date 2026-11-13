import { requireEnv } from "./env";

// The landing app's `/preview-start-page` route, which the content editor
// embeds in an iframe. REQUIRED in production — a missing var fails fast
// (#1366) instead of an empty iframe; in dev it defaults to the local landing
// dev server.
//
// service-preview.tsx still reads the var itself with a `|| ""` fallback: it
// is in a chunk every builder page loads, and builder PR previews are built
// without this var, so importing this there would break every preview (#2871).
export const LANDING_PREVIEW_URL = requireEnv(
  import.meta.env.VITE_LANDING_PREVIEW_URL,
  "VITE_LANDING_PREVIEW_URL",
  "http://localhost:4000/preview-start-page",
);
