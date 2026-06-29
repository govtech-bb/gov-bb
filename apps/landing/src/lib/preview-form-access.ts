import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'

/**
 * Per-form preview accessibility check (#1646 Phase 3).
 *
 * A `preview`/`draft` reviewer on a not-yet-public content page should see its
 * "Start now" button when the linked form is reachable for them — but the form
 * is, by definition, absent from the public list `available-forms.ts` serves.
 * This does a single tokened `GET /form-definitions/:formId` with the preview
 * secret as `X-Recipe-Preview`; a 200 means the API's #1646 gate let it through
 * (the form is published, just flagged), so the button is safe to render.
 *
 * Crucially it does NOT touch the shared, module-level public-forms cache — a
 * reviewer's per-form check must never pollute what the public sees.
 */

const DEFAULT_API_URL = 'https://forms.api.sandbox.alpha.gov.bb'
const FETCH_TIMEOUT_MS = 15_000

/**
 * Decide accessibility from an injected status fetcher. Pure w.r.t. I/O so it
 * can be tested without the network. Fails closed: with no configured secret,
 * a reviewer gets no extra access.
 */
export async function resolveFormAccessible({
  formId,
  previewSecret,
  fetchStatus,
}: {
  formId: string
  previewSecret: string | undefined
  fetchStatus: (formId: string, secret: string) => Promise<number>
}): Promise<boolean> {
  if (!previewSecret) return false
  return (await fetchStatus(formId, previewSecret)) === 200
}

/** Tokened GET to the forms API; returns the HTTP status (0 on network error). */
async function fetchFormStatus(
  formId: string,
  secret: string,
  apiBase: string,
): Promise<number> {
  const base = apiBase.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${base}/form-definitions/${encodeURIComponent(formId)}`,
      { headers: { 'X-Recipe-Preview': secret }, signal: controller.signal },
    )
    return response.status
  } catch {
    return 0
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Server function: is this form accessible to the current reviewer? Runs only
 * on the server, so the preview secret (build-baked runtime config in prod,
 * `process.env` in dev — the same dual-source as `resolveViewLevel`) never
 * reaches the client.
 */
export const checkFormAccessible = createServerFn()
  .validator((formId: string) => formId)
  .handler(async ({ data: formId }): Promise<boolean> => {
    // Same dual-source as send-feedback.ts / resolveViewLevel: the build-baked
    // runtimeConfig is authoritative in prod (the SSR Lambda has no Console env
    // vars), with process.env as the local-dev source.
    const config = useRuntimeConfig() as {
      previewSecret?: string
      formsApiUrl?: string
    }
    const previewSecret =
      config.previewSecret || process.env.PREVIEW_SECRET || undefined
    const apiBase =
      config.formsApiUrl || process.env.VITE_FORMS_API_URL || DEFAULT_API_URL
    return resolveFormAccessible({
      formId,
      previewSecret,
      fetchStatus: (id, secret) => fetchFormStatus(id, secret, apiBase),
    })
  })
