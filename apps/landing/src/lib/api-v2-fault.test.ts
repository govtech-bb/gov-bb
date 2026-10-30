import { createServer as createHttpServer } from 'node:http'
import type { Server as HttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import type { AddressInfo, Server as NetServer, Socket } from 'node:net'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createApiV2Cache } from './api-v2-cache'
import { resolveApiV2Page } from './api-v2-page'

/**
 * Fault injection for landing's api_v2 page fetch (#3148, guarding #3127).
 * Real timers and real sockets: local stubs stand in for an api_v2 that is
 * down, black-holed or slow, and each request goes through the same
 * `createApiV2Cache().get(url, () => resolveApiV2Page(base, url))` pair that
 * `getApiV2Page` (called from routes/$.tsx) runs. A fresh cache per test is
 * the reset for the module-level cache and breaker. That wiring, and $.tsx's
 * skip when VITE_API_V2_URL is unset, are mirrored here, not executed.
 *
 * The budget is fixed here, not derived from API_V2_TIMEOUT_MS, so the test
 * fails if the timeout goes back to 5 s.
 */

/** The 750 ms timeout plus 300 ms (#3148's budget). */
const BUDGET_MS = 1_050
/** Concurrent requests per scenario: all start before the breaker opens. */
const SAMPLES = 10
const FAILURES_TO_OPEN = 3
/** Over a 5 s timeout, so a regression fails on the budget, with its p95. */
const TEST_TIMEOUT_MS = 15_000
const OPEN_MS = 30_000

type Cache = ReturnType<typeof createApiV2Cache>

/** One page's api_v2 step, as $.tsx runs it: skipped when the URL is unset. */
async function pageTime(cache: Cache, base: string | null, url: string) {
  const start = performance.now()
  const result = base
    ? await cache.get(url, () => resolveApiV2Page(base, url))
    : ({ kind: 'miss', reason: 'skipped' } as const)
  return { ms: performance.now() - start, result }
}

/** Nearest-rank p95; with 10 samples that is the slowest one. */
function p95(samples: Array<number>) {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

/** SAMPLES concurrent first-time page loads on a fresh cache. */
async function loadConcurrently(base: string) {
  const cache = createApiV2Cache()
  return Promise.all(
    Array.from({ length: SAMPLES }, (_, i) =>
      pageTime(cache, base, `/page-${i}`),
    ),
  )
}

const listen = (server: NetServer | HttpServer) =>
  new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  )

// Accepts the TCP connection, never answers.
const sockets = new Set<Socket>()
const blackhole = createNetServer((socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})
// Answers every request after 10 s.
let slowRequests = 0
const slow = createHttpServer((_req, res) => {
  slowRequests++
  const timer = setTimeout(() => res.writeHead(404).end(), 10_000)
  res.on('close', () => clearTimeout(timer))
})

let blackholeBase: string
let slowBase: string
let refusedBase: string

beforeAll(async () => {
  blackholeBase = await listen(blackhole)
  slowBase = await listen(slow)
  // A port nothing listens on: bind, note it, close.
  const closed = createNetServer()
  refusedBase = await listen(closed)
  await new Promise((resolve) => closed.close(resolve))
})

afterAll(async () => {
  for (const socket of sockets) socket.destroy()
  slow.closeAllConnections()
  await Promise.all(
    [blackhole, slow].map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
  )
})

beforeEach(() => {
  slowRequests = 0
  // Every failed fetch logs; keep the output readable.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return () => vi.restoreAllMocks()
})

describe('landing with a slow or unavailable api_v2', () => {
  it.each([
    ['refuses connections', () => refusedBase, 'network'],
    ['accepts but never answers', () => blackholeBase, 'timeout'],
    ['answers after 10 s', () => slowBase, 'timeout'],
  ])(
    `keeps p95 under ${BUDGET_MS} ms when api_v2 %s`,
    async (name, base, reason) => {
      const samples = await loadConcurrently(base())
      for (const { result } of samples)
        expect(result).toEqual({ kind: 'miss', reason })
      const ms = p95(samples.map((s) => s.ms))
      console.info(`[api-v2-fault] ${name}: p95 ${ms.toFixed(1)} ms`)
      expect(ms).toBeLessThan(BUDGET_MS)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'stops calling api_v2 for 30 s after 3 failures, at the speed of no api_v2',
    async () => {
      const cache = createApiV2Cache()
      const trippedAt = Date.now()
      await Promise.all(
        Array.from({ length: FAILURES_TO_OPEN }, (_, i) =>
          pageTime(cache, slowBase, `/trip-${i}`),
        ),
      )
      expect(slowRequests).toBe(FAILURES_TO_OPEN)

      const open: Array<number> = []
      const unset: Array<number> = []
      for (let i = 0; i < 50; i++) {
        const sample = await pageTime(cache, slowBase, `/open-${i}`)
        expect(sample.result).toEqual({ kind: 'miss', reason: 'circuit_open' })
        open.push(sample.ms)
        unset.push((await pageTime(cache, null, `/open-${i}`)).ms)
      }
      // Still open at the end of the window; the clock is passed in, not faked.
      expect(
        await cache.get(
          '/late',
          () => resolveApiV2Page(slowBase, '/late'),
          trippedAt + OPEN_MS - 1,
        ),
      ).toEqual({ kind: 'miss', reason: 'circuit_open' })
      expect(slowRequests).toBe(FAILURES_TO_OPEN)

      // Within 10% of unset, with a 5 ms floor: both are sub-millisecond, where
      // 10% is scheduler noise. The no-calls asserts above are the real guard.
      const [openP95, unsetP95] = [p95(open), p95(unset)]
      console.info(
        `[api-v2-fault] breaker open: p95 ${openP95.toFixed(3)} ms, unset: p95 ${unsetP95.toFixed(3)} ms`,
      )
      expect(openP95).toBeLessThanOrEqual(
        Math.max(unsetP95 * 1.1, unsetP95 + 5),
      )

      // Just after the window, api_v2 is called again (the 4th request reaches
      // the stub). The window opened when the trip requests started, within a
      // few ms of trippedAt.
      const reopened = cache.get(
        '/after',
        () => resolveApiV2Page(slowBase, '/after'),
        trippedAt + OPEN_MS + 100,
      )
      await vi.waitFor(() => expect(slowRequests).toBe(FAILURES_TO_OPEN + 1))
      expect(await reopened).toEqual({ kind: 'miss', reason: 'timeout' })
    },
    TEST_TIMEOUT_MS,
  )
})
