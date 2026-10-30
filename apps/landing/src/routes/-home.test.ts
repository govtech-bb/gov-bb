import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ChatModule from '../lib/chat-suggestions'
// Type-only, so the route loads after the mock below is in place.
import type * as HomeRouteModule from './index'
import { publicChatSuggestions } from '../lib/chat-suggestions'
import { deriveVisibilityOverlay } from '../lib/service-status'
import type { ServiceStatusEntry } from '../lib/service-status'

const chatMocks = vi.hoisted(() => ({
  getServedChatSuggestions: vi.fn(),
}))
vi.mock('../lib/chat-suggestions', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatModule>()),
  ...chatMocks,
}))

let Route: typeof HomeRouteModule.Route
beforeAll(async () => {
  ;({ Route } = await import('./index'))
}, 60_000)

beforeEach(() => {
  chatMocks.getServedChatSuggestions.mockReset()
})

const serviceStatuses: ServiceStatusEntry[] = [
  ['get-birth-certificate', 'disabled'],
]
const loader = () => Route.options.loader as (a: unknown) => unknown

describe('/ loader chat suggestions', () => {
  it('asks api_v2 when it is configured', async () => {
    chatMocks.getServedChatSuggestions.mockResolvedValue(['served'])
    const result = await loader()({
      context: {
        serviceStatuses,
        categoryTree: { kind: 'found', categories: [] },
      },
    })
    expect(result).toEqual(['served'])
  })

  it('shows no chips when the server function call fails', async () => {
    chatMocks.getServedChatSuggestions.mockRejectedValue(new Error('offline'))
    const result = await loader()({
      context: {
        serviceStatuses,
        categoryTree: { kind: 'found', categories: [] },
      },
    })
    expect(result).toEqual([])
  })

  it('uses the static overlay when api_v2 is unset', async () => {
    const result = await loader()({
      context: { serviceStatuses, categoryTree: { kind: 'disabled' } },
    })
    expect(chatMocks.getServedChatSuggestions).not.toHaveBeenCalled()
    expect(result).toEqual(
      publicChatSuggestions(deriveVisibilityOverlay(serviceStatuses)),
    )
  })
})
