import { requireEnv } from "./env";

// Single source of truth for the API base URL every forms client calls.
// REQUIRED in production — a missing var fails fast (#1366) rather than
// silently pointing a deployed build at localhost; in dev it defaults to the
// local API. Resolved once here so no read site can carry its own fallback
// (#2871).
export const API_URL = requireEnv(
  import.meta.env.VITE_API_URL,
  "VITE_API_URL",
  "http://localhost:3001",
);
