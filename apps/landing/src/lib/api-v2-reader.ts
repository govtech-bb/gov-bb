import type { z } from 'zod'
import type { ApiV2MissReason } from './api-v2-page'
import { REASONS, logFallback, message } from './api-v2-log'

/**
 * The one reader landing's api_v2 reads go through (#3644). It owns the
 * transport (timeout, landing's token, releasing an unread body), the
 * `api_v2_fallback` line (contract in api-v2-page.ts) and the breaker, which
 * describes api_v2's health, so every read counts toward it and is turned away
 * by it. Page reads use the same breaker through their cache (api-v2-cache.ts).
 *
 * The breaker is module state here, not in a module that defines server
 * functions: TanStack Start copies those into the extracted handler, which
 * would make two breakers (see api-v2-site-cache.ts, #3461).
 */

export const API_V2_TIMEOUT_MS = 750

const FAILURES_TO_OPEN = 3
const OPEN_MS = 30_000

/** After three failures in a row, api_v2 isn't called for 30 s. */
export function createApiV2Breaker() {
  let failures = 0
  let openUntil = 0

  return {
    /** Whether a read begun at `now` is turned away without a request. */
    isOpen: (now: number) => now < openUntil,
    /** A read begun at `now` ended: a failure counts, any answer resets. */
    record(failed: boolean, url: string, now: number) {
      if (!failed) {
        failures = 0
        return
      }
      // Started before the breaker opened: already counted by its trip.
      if (now < openUntil) return
      if (++failures >= FAILURES_TO_OPEN) {
        openUntil = now + OPEN_MS
        failures = 0
        console.error(JSON.stringify({ event: 'api_v2_circuit_open', url }))
      }
    },
    /** Closed, nothing counted: for tests, which share `apiV2Breaker`. */
    reset() {
      failures = 0
      openUntil = 0
    },
  }
}

/** The breaker every read of api_v2 shares. Pure, so the client build drops it with the reads. */
export const apiV2Breaker = /* @__PURE__ */ createApiV2Breaker()

/**
 * Why a read has nothing to show: a 404 the caller may expect, a request
 * api_v2 rejected, or a failure.
 */
export type ApiV2ReadMiss = {
  kind: 'miss'
  reason: Extract<
    ApiV2MissReason,
    | 'not_found'
    | 'rejected'
    | 'status'
    | 'malformed'
    | 'timeout'
    | 'network'
    | 'circuit_open'
  >
}

/**
 * GET a public api_v2 read, parsed. A failure (`status`, `malformed`,
 * `timeout`, `network`) logs an `api_v2_fallback` line and counts toward the
 * breaker; while it is open the read is a `circuit_open` miss, without a
 * request or a line. A 404 is a silent `not_found` the caller may expect. Any
 * other 4xx but 408 and 429 is `rejected`, logged at `warn` and not counted:
 * api_v2 answered, the request was wrong, so a visitor's bad input (a
 * collection key api_v2 refuses) can't open the breaker for the whole site.
 */
export async function readPublic<T>(
  base: string,
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  landingToken?: string,
): Promise<{ kind: 'ok'; value: T } | ApiV2ReadMiss> {
  const now = Date.now()
  if (apiV2Breaker.isOpen(now)) return { kind: 'miss', reason: 'circuit_open' }

  const result = await read(base, path, schema, fetchImpl, landingToken)
  apiV2Breaker.record(
    result.kind === 'miss' && REASONS[result.reason].failure,
    path,
    now,
  )

  return result
}

async function read<T>(
  base: string,
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  landingToken?: string,
): Promise<{ kind: 'ok'; value: T } | ApiV2ReadMiss> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_V2_TIMEOUT_MS)

  try {
    const response = await fetchImpl(`${base}${path}`, {
      signal: controller.signal,
      ...(landingToken && { headers: { 'x-landing-token': landingToken } }),
    })

    if (response.status === 404) {
      // Release the socket: an unread body pins a keep-alive connection.
      await response.body?.cancel()

      return { kind: 'miss', reason: 'not_found' }
    }

    if (response.status !== 200) {
      await response.body?.cancel()
      // As for pages: 408/429 say api_v2 (or a proxy) is busy, not that the
      // request was wrong.
      const rejected =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429
      const reason = rejected ? 'rejected' : 'status'
      logFallback(reason, path, { status: response.status })

      return { kind: 'miss', reason }
    }

    const body: unknown = await response.json().catch(() => undefined)
    const parsed = schema.safeParse(body)

    if (parsed.success) return { kind: 'ok', value: parsed.data }
    if (controller.signal.aborted) throw new Error('timed out reading the body')
    logFallback('malformed', path)

    return { kind: 'miss', reason: 'malformed' }
  } catch (error) {
    const reason = controller.signal.aborted ? 'timeout' : 'network'
    logFallback(reason, path, { error: message(error) })

    return { kind: 'miss', reason }
  } finally {
    clearTimeout(timer)
  }
}
