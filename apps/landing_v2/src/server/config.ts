import { useRuntimeConfig } from "nitro/runtime-config";

/**
 * The two base URLs the server reads, resolved from the build-time snapshot in
 * Nitro runtime config (see vite.config.ts), then `process.env`.
 *
 * The snapshot wins, because the Amplify SSR Lambda never sees the Console's
 * environment variables at runtime. `process.env` is the fallback for
 * `vite dev`, where Nitro's dev server loads `.env`. The local-port default
 * is reachable only under `vite dev`: a production build without the
 * variable fails in vite.config.ts, so a built server always has a snapshot.
 *
 * Server-only. Nothing in the browser may import this module; the route
 * files reach it only through server-function handlers, which the Start
 * compiler strips from the client build.
 */

// Assumption (#2702): 8 — `vite dev` falls back to api_v2's local port.
const DEV_API_V2_URL = "http://localhost:3020";
// Assumption (#2702): 9 — and to the forms app's local port.
const DEV_FORMS_URL = "http://localhost:3000";

function resolveUrl(
  configUrl: string | undefined,
  envUrl: string | undefined,
  devDefault: string,
): string {
  return (configUrl || envUrl || devDefault).replace(/\/+$/, "");
}

/** api_v2's base URL from its two sources, trailing slashes trimmed. */
export function resolveApiV2Url(
  configUrl: string | undefined,
  envUrl: string | undefined,
): string {
  return resolveUrl(configUrl, envUrl, DEV_API_V2_URL);
}

/** The forms app's base URL from its two sources, trailing slashes trimmed. */
export function resolveFormsUrl(
  configUrl: string | undefined,
  envUrl: string | undefined,
): string {
  return resolveUrl(configUrl, envUrl, DEV_FORMS_URL);
}

interface LandingV2RuntimeConfig {
  apiV2Url?: string;
  formsUrl?: string;
}

/** api_v2's base URL for the current runtime. */
export function apiV2Url(): string {
  const config = useRuntimeConfig() as LandingV2RuntimeConfig;
  return resolveApiV2Url(config.apiV2Url, process.env.API_V2_URL);
}

/** The forms app's base URL for the current runtime. */
export function formsUrl(): string {
  const config = useRuntimeConfig() as LandingV2RuntimeConfig;
  return resolveFormsUrl(config.formsUrl, process.env.FORMS_URL);
}
