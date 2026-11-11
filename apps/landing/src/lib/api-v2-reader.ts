import type { z } from 'zod'
import type { ApiV2MissReason } from './api-v2-page'
import { logFallback, message } from './api-v2-log'

/**
 * The one reader landing's api_v2 reads go through (#3644). It owns the
 * transport (timeout, landing's token, releasing an unread body) and the
 * `api_v2_fallback` line (contract in api-v2-page.ts).
 */

export const API_V2_TIMEOUT_MS = 750

/** Why a read has nothing to show: a 404 the caller may expect, or a failure. */
export type ApiV2ReadMiss = {
  kind: 'miss'
  reason: Extract<
    ApiV2MissReason,
    'not_found' | 'status' | 'malformed' | 'timeout' | 'network'
  >
}

/**
 * GET a public api_v2 read, parsed. A failure (`status`, `malformed`,
 * `timeout`, `network`) logs an `api_v2_fallback` line. A 404 is a silent
 * `not_found` the caller may expect.
 */
export async function readPublic<T>(
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
      logFallback('status', path, { status: response.status })
      await response.body?.cancel()

      return { kind: 'miss', reason: 'status' }
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
