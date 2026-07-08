/**
 * Small HTTP helpers shared by every module that fetches from the forms API
 * server-side (`available-forms.ts`, `service-status.ts`) — extracted so the
 * base URL / timeout logic lives in one place instead of two byte-identical
 * copies.
 */

const DEFAULT_API_URL = 'https://forms.api.sandbox.alpha.gov.bb'
export const FETCH_TIMEOUT_MS = 15_000

export async function fetchWithTimeout(
  url: string,
  ms: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Base URL of the forms API, trailing slashes trimmed. */
export function formsApiBase(): string {
  return (process.env.VITE_FORMS_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '')
}
