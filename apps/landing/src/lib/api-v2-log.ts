import type { ApiV2MissReason, ContentSource } from './api-v2-page'

/**
 * Each miss reason, classified once (contract at the top of api-v2-page.ts).
 * `failure`: api_v2 failed rather than answered — never cached, counted by the
 * breaker. `source`: the `x-content-source` value. `level`: the console method
 * for its `api_v2_fallback` line; none means it isn't logged.
 */
export const REASONS: Record<
  ApiV2MissReason,
  { failure: boolean; source: ContentSource; level?: 'error' | 'warn' }
> = {
  unconfigured: { failure: false, source: 'static' },
  skipped: { failure: false, source: 'static' },
  not_found: { failure: false, source: 'static' },
  rejected: { failure: false, source: 'static', level: 'warn' },
  bad_redirect: { failure: false, source: 'static-fallback', level: 'warn' },
  compile: { failure: false, source: 'static-fallback', level: 'warn' },
  no_target: { failure: true, source: 'static-fallback', level: 'error' },
  status: { failure: true, source: 'static-fallback', level: 'error' },
  malformed: { failure: true, source: 'static-fallback', level: 'error' },
  timeout: { failure: true, source: 'static-fallback', level: 'error' },
  network: { failure: true, source: 'static-fallback', level: 'error' },
  // Turned away by the open breaker: its trip logs `api_v2_circuit_open` once.
  circuit_open: { failure: true, source: 'static-fallback' },
}

/** An error's message, with its `cause` chain (where Node's fetch puts why). */
export const message = (error: unknown): string =>
  error instanceof Error
    ? error.cause
      ? `${error.message}: ${message(error.cause)}`
      : error.message
    : String(error)

/** The `api_v2_fallback` line, at the reason's level. */
export function logFallback(
  reason: ApiV2MissReason,
  url: string,
  detail: Record<string, unknown> = {},
) {
  const { level } = REASONS[reason]
  if (level)
    console[level](
      JSON.stringify({ event: 'api_v2_fallback', reason, url, ...detail }),
    )
}
