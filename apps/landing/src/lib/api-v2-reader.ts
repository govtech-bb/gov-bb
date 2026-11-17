import type { z } from 'zod'
import type { ApiV2MissReason } from './api-v2-page'
import { REASONS, logFallback, message } from './api-v2-log'

/**
 * The one reader landing's api_v2 reads go through (#3644). It owns the
 * transport (timeout, the token headers, releasing an unread body), the
 * `api_v2_fallback` line for `status`, `rejected`, `malformed`, `timeout` and
 * `network` (contract in api-v2-page.ts; the page module logs its own
 * reasons) and the breaker, which describes api_v2's health, so every public
 * read counts toward it and is turned away by it, once: `readPublic` checks it
 * for its reads, the page cache (api-v2-cache.ts) for page reads, which go
 * through `readApiV2`. A reviewer's page read bypasses it. The site-version
 * check (api-v2-version.ts) is turned away by it, but its failures neither
 * count nor log.
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

/** api_v2 failed (vs. answered): never cached, counted toward the breaker. */
export const failed = (result: {
  kind: string
  reason?: keyof typeof REASONS
}) =>
  result.kind === 'miss' &&
  result.reason !== undefined &&
  REASONS[result.reason].failure

/**
 * Why a read has nothing to show: a 404 the caller may expect, a request
 * api_v2 rejected, or a failure. The two answers carry their `Cache-Control`.
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
  cacheControl?: string | null
}

/** A parsed answer from api_v2, with its `Cache-Control`, or why there is none. */
export type ApiV2Read<T> =
  | { kind: 'ok'; value: T; cacheControl: string | null }
  | ApiV2ReadMiss

/** How a read is sent and logged, and the answers its caller reads itself. */
export interface ApiV2ReadOptions<A> {
  landingToken?: string
  /** A reviewer's read (#2961), sent as `x-preview-token`. */
  previewToken?: string
  /** The `url` of its log lines; the request path by default. */
  logUrl?: string
  /** `'manual'` for a caller that reads a redirect itself. */
  redirect?: RequestRedirect
  /** `API_V2_TIMEOUT_MS` by default. */
  timeoutMs?: number
  /** No `api_v2_fallback` lines: for a read whose failure changes nothing. */
  quiet?: boolean
  /**
   * The caller's own reading of an answer, before the reader's: a result is
   * the read's, `undefined` leaves the answer to the reader. It runs within
   * the timeout, and a throw is a `timeout` or `network` miss.
   */
  answer?: (response: Response, signal: AbortSignal) => Promise<A | undefined>
}

/**
 * GET a public api_v2 read, parsed, through the breaker. A failure (`status`,
 * `malformed`, `timeout`, `network`) logs an `api_v2_fallback` line and counts
 * toward the breaker; while it is open the read is a `circuit_open` miss,
 * without a request or a line. A 404 is a silent `not_found` the caller may
 * expect. Any other 4xx but 408 and 429 is `rejected`, logged at `warn` and
 * not counted: api_v2 answered, the request was wrong, so a visitor's bad
 * input (a collection key api_v2 refuses) can't open the breaker for the
 * whole site.
 */
export async function readPublic<T>(
  base: string,
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  landingToken?: string,
): Promise<ApiV2Read<T>> {
  const now = Date.now()
  if (apiV2Breaker.isOpen(now)) return { kind: 'miss', reason: 'circuit_open' }

  const result = await readApiV2(base, path, schema, fetchImpl, {
    landingToken,
  })
  apiV2Breaker.record(failed(result), path, now)

  return result
}

/**
 * The transport alone, classed and logged as `readPublic` is, with no breaker:
 * page reads, whose cache checks and records it (api-v2-cache.ts), reviewer
 * reads, which bypass it, and the site-version check, which only checks it.
 */
export async function readApiV2<T, A = never>(
  base: string,
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  {
    landingToken,
    previewToken,
    logUrl = path,
    redirect,
    timeoutMs = API_V2_TIMEOUT_MS,
    quiet = false,
    answer,
  }: ApiV2ReadOptions<A> = {},
): Promise<ApiV2Read<T> | A> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const log: typeof logFallback = quiet ? () => {} : logFallback

  try {
    const response = await fetchImpl(`${base}${path}`, {
      redirect,
      signal: controller.signal,
      ...((landingToken || previewToken) && {
        headers: {
          ...(landingToken && { 'x-landing-token': landingToken }),
          ...(previewToken && { 'x-preview-token': previewToken }),
        },
      }),
    })

    const own = await answer?.(response, controller.signal)
    if (own !== undefined) return own

    const cacheControl = response.headers.get('cache-control')

    if (response.status === 404) {
      // Release the socket: an unread body pins a keep-alive connection.
      await response.body?.cancel()

      return { kind: 'miss', reason: 'not_found', cacheControl }
    }

    if (response.status !== 200) {
      await response.body?.cancel()
      // A 4xx is api_v2 answering (a page url over its 512-char limit, a
      // collection key it refuses), so a visitor can't trip the breaker with
      // junk input. 408/429 say api_v2 (or a proxy) is busy, not that the
      // request was wrong.
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429
      ) {
        log('rejected', logUrl, { status: response.status })

        return { kind: 'miss', reason: 'rejected', cacheControl }
      }
      log('status', logUrl, { status: response.status })

      return { kind: 'miss', reason: 'status' }
    }

    const body: unknown = await response.json().catch(() => undefined)
    const parsed = schema.safeParse(body)

    if (parsed.success) return { kind: 'ok', value: parsed.data, cacheControl }
    if (controller.signal.aborted) throw new Error('timed out reading the body')
    log('malformed', logUrl)

    return { kind: 'miss', reason: 'malformed' }
  } catch (error) {
    const reason = controller.signal.aborted ? 'timeout' : 'network'
    log(reason, logUrl, { error: message(error) })

    return { kind: 'miss', reason }
  } finally {
    clearTimeout(timer)
  }
}
