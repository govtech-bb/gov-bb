import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server, ServerResponse } from 'node:http'
import type * as FetchJson from './fetch-json-with-timeout'
import type { ServiceStatusEntry } from './service-status'

// Invoke the generated server handlers without an HTTP RPC/Start context.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (_rpc: unknown, handler: () => unknown) => ({
      __executeServer: handler,
    }),
  }),
}))

const api = vi.hoisted(() => ({ base: '' }))
vi.mock('./forms-api-url', () => ({ formsApiBase: () => api.base }))
vi.mock('./fetch-json-with-timeout', async (importOriginal) => {
  const { fetchJsonWithTimeout } = await importOriginal<typeof FetchJson>()
  return {
    fetchJsonWithTimeout: (url: string, ms: number) => {
      expect(ms).toBe(15_000)
      // Keep real fetch/stream cancellation without a 15-second test wait.
      return fetchJsonWithTimeout(url, 250)
    },
  }
})

const feeds = [
  {
    path: '/form-definitions',
    data: [{ formId: 'available' }],
    value: ['available'],
    read: async () => {
      const handlers = await vi.importActual<{
        getAvailableForms_createServerFn_handler: () => Promise<string[]>
      }>('./available-forms?tss-serverfn-split')
      return handlers.getAvailableForms_createServerFn_handler()
    },
  },
  {
    path: '/form-definitions/maintenance',
    data: ['maintenance'],
    value: ['maintenance'],
    read: async () => {
      const handlers = await vi.importActual<{
        getMaintenanceForms_createServerFn_handler: () => Promise<string[]>
      }>('./available-forms?tss-serverfn-split')
      return handlers.getMaintenanceForms_createServerFn_handler()
    },
  },
  {
    path: '/form-definitions/closed',
    data: ['closed'],
    value: ['closed'],
    read: async () => {
      const handlers = await vi.importActual<{
        getClosedForms_createServerFn_handler: () => Promise<string[]>
      }>('./available-forms?tss-serverfn-split')
      return handlers.getClosedForms_createServerFn_handler()
    },
  },
  {
    path: '/service_status',
    data: [{ slug: 'service', status: 'disabled' }],
    value: [['service', 'disabled']],
    read: async () => {
      const handlers = await vi.importActual<{
        getServiceStatuses_createServerFn_handler: () => Promise<
          ServiceStatusEntry[]
        >
      }>('./service-status?tss-serverfn-split')
      return handlers.getServiceStatuses_createServerFn_handler()
    },
  },
]

describe('cached feed fetches', () => {
  let server: Server
  let respond: (response: ServerResponse, path: string) => void
  const realFetch = globalThis.fetch

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    respond = (response, path) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          status: 'success',
          data: feeds.find((feed) => feed.path === path)?.data,
        }),
      )
    }
    server = createServer((request, response) =>
      respond(response, request.url ?? ''),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    api.base = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(feeds)(
    '$path times out while consuming JSON and keeps its warm cache',
    async (feed) => {
      await expect(feed.read()).resolves.toEqual(feed.value)
      vi.setSystemTime(60_000)
      respond = (response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.write('{"status":"success","data":[')
      }
      let signal: AbortSignal | null | undefined
      let headersReceived!: () => void
      const headers = new Promise<void>((resolve) => {
        headersReceived = resolve
      })
      const fetcher = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          signal = init?.signal
          const response = await realFetch(input, init)
          headersReceived()
          return response
        })

      const pending = feed.read()
      await headers
      await expect(pending).resolves.toEqual(feed.value)
      expect(signal?.aborted).toBe(true)
      await expect(feed.read()).resolves.toEqual(feed.value)
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )

  it.each([feeds[0], feeds[3]])(
    '$path shares a cold-start body timeout and retry before recovering',
    async (feed) => {
      const success = respond
      let attempts = 0
      respond = (response, path) => {
        attempts++
        if (attempts === 1) {
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.write('{"status":"success","data":[')
        } else {
          success(response, path)
        }
      }
      const fetcher = vi.spyOn(globalThis, 'fetch')

      await expect(Promise.all([feed.read(), feed.read()])).resolves.toEqual([
        feed.value,
        feed.value,
      ])
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(attempts).toBe(2)
      expect(console.warn).not.toHaveBeenCalled()
      await expect(feed.read()).resolves.toEqual(feed.value)
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

  it('keeps all four feed caches independent during concurrent cold and stale requests', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    const requests = feeds.flatMap((feed) => [feed.read(), feed.read()])
    const values = feeds.flatMap((feed) => [feed.value, feed.value])

    await expect(Promise.all(requests)).resolves.toEqual(values)
    expect(fetcher).toHaveBeenCalledTimes(4)
    for (const feed of feeds) {
      expect(
        fetcher.mock.calls.filter(([url]) => url === `${api.base}${feed.path}`),
      ).toHaveLength(1)
      await expect(feed.read()).resolves.toEqual(feed.value)
    }
    expect(fetcher).toHaveBeenCalledTimes(4)

    vi.setSystemTime(60_000)
    await expect(
      Promise.all(feeds.flatMap((feed) => [feed.read(), feed.read()])),
    ).resolves.toEqual(values)
    expect(fetcher).toHaveBeenCalledTimes(8)
    for (const feed of feeds) {
      expect(
        fetcher.mock.calls.filter(([url]) => url === `${api.base}${feed.path}`),
      ).toHaveLength(2)
    }
  })
})
