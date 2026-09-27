import { useRuntimeConfig } from "nitro/runtime-config";

/**
 * The two base URLs the server reads, resolved from the build-time snapshot in
 * Nitro runtime config (see vite.config.ts), then `process.env`.
 *
 * The snapshot wins, because the Amplify SSR Lambda never sees the Console's
 * environment variables at runtime. `process.env` is what `vite dev` reads:
 * there `useRuntimeConfig()` is Nitro's stub, with no snapshot in it (dev
 * logs "Nitro runtime imports detected without a builder or Nitro plugin",
 * and a `NITRO_API_V2_URL` override has no effect), so the value comes from
 * the shell dev was started in. When neither is set, `vite dev` falls back to
 * the local port and a built server throws, naming the variable.
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
  isDev: boolean,
  devDefault: string,
  notSet: string,
): string {
  const url = configUrl || envUrl || (isDev ? devDefault : undefined);
  // Assumption (#2702): 8 — a built server without the variable fails here,
  // at its first request, not at build time: CI's build step and the local
  // nx gates build every project with no environment set, so a build-time
  // failure would break them. apps/landing's forms-api-url.ts fails the same
  // way. No silent localhost default outside `vite dev`.
  if (!url) throw new Error(notSet);
  return url.replace(/\/+$/, "");
}

/** api_v2's base URL from its two sources, trailing slashes trimmed. */
export function resolveApiV2Url(
  configUrl: string | undefined,
  envUrl: string | undefined,
  isDev: boolean,
): string {
  return resolveUrl(
    configUrl,
    envUrl,
    isDev,
    DEV_API_V2_URL,
    "API_V2_URL is not set. landing_v2 needs it to reach api_v2. Set it in " +
      "the Amplify Console for deployed environments, or in the environment " +
      "`vite build` runs in for a local build.",
  );
}

/** The forms app's base URL from its two sources, trailing slashes trimmed. */
export function resolveFormsUrl(
  configUrl: string | undefined,
  envUrl: string | undefined,
  isDev: boolean,
): string {
  return resolveUrl(
    configUrl,
    envUrl,
    isDev,
    DEV_FORMS_URL,
    "FORMS_URL is not set. landing_v2 needs it to link Start buttons to " +
      "the forms app. Set it in the Amplify Console for deployed " +
      "environments, or in the environment `vite build` runs in for a " +
      "local build.",
  );
}

interface LandingV2RuntimeConfig {
  apiV2Url?: string;
  formsUrl?: string;
}

/** api_v2's base URL for the current runtime. */
export function apiV2Url(): string {
  const config = useRuntimeConfig() as LandingV2RuntimeConfig;
  return resolveApiV2Url(
    config.apiV2Url,
    process.env.API_V2_URL,
    import.meta.env.DEV,
  );
}

/** The forms app's base URL for the current runtime. */
export function formsUrl(): string {
  const config = useRuntimeConfig() as LandingV2RuntimeConfig;
  return resolveFormsUrl(
    config.formsUrl,
    process.env.FORMS_URL,
    import.meta.env.DEV,
  );
}
