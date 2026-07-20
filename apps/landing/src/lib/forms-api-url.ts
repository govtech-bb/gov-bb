import { useRuntimeConfig } from 'nitro/runtime-config'

/**
 * The forms API base URL, resolved once for every landing → forms-API call
 * (`service_status`, `form-definitions`, `feedback`).
 *
 * Precedence: the build-time snapshot in Nitro runtime config
 * (`formsApiUrl`, see vite.config.ts) wins, because the Amplify SSR Lambda may
 * not see Console env vars at runtime; `process.env.VITE_FORMS_API_URL` is the
 * fallback for local dev and tooling. There is deliberately **no default** — a
 * missing value throws so a misconfigured environment fails loudly instead of
 * silently reaching the sandbox API (which previously served
 * wrong-environment data when `VITE_FORMS_API_URL` was unset).
 */

/**
 * Pure resolution of the base URL from its two possible sources, trailing
 * slashes trimmed. Decoupled from Nitro so the precedence and required-var
 * behaviour can be tested without a runtime.
 */
export function resolveFormsApiBase(
  configUrl: string | undefined,
  envUrl: string | undefined,
): string {
  const url = configUrl || envUrl
  if (!url) {
    throw new Error(
      'VITE_FORMS_API_URL is not set. Landing needs it to reach the forms API ' +
        '(service_status, form-definitions, feedback). Set it in the Amplify ' +
        'Console for deployed environments, or in apps/landing/.env for local dev.',
    )
  }
  return url.replace(/\/+$/, '')
}

/** The forms API base URL for the current runtime. See {@link resolveFormsApiBase}. */
export function formsApiBase(): string {
  const config = useRuntimeConfig() as { formsApiUrl?: string }
  return resolveFormsApiBase(config.formsApiUrl, process.env.VITE_FORMS_API_URL)
}
