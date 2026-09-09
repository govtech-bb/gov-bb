import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { formsApiBase } from '../../../../lib/forms-api-url'
import type { Outage } from './outages'
import { PARISHES } from './parishes'

export interface WaterOutagesData {
  outages: Outage[]
  checkedAt: string | null
  /** One server timestamp keeps freshness labels identical during hydration. */
  now: number
  failed: boolean
}

const OutagesSchema = z.object({
  outages: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      link: z.url({ protocol: /^https?$/ }),
      published: z.iso.datetime(),
      summary: z.string(),
      parishes: z.array(z.string()),
      type: z.enum(['emergency', 'planned', 'repair', 'notice']),
      eventDay: z.iso.date().optional(),
      endsAt: z.iso.datetime({ offset: true }).optional(),
    }),
  ),
  checkedAt: z.iso.datetime(),
})

export async function fetchWaterOutages(
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WaterOutagesData> {
  const now = Date.now()
  try {
    const res = await fetchImpl(
      `${apiBase.replace(/\/+$/, '')}/water-alerts/outages`,
      {
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!res.ok) throw new Error('Water notices unavailable')
    return { ...OutagesSchema.parse(await res.json()), now, failed: false }
  } catch {
    return { outages: [], checkedAt: null, now, failed: true }
  }
}

export const getWaterOutages = createServerFn().handler(() =>
  fetchWaterOutages(formsApiBase()),
)

const SubscribeSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  area: z
    .string()
    .refine(
      (value) =>
        value === '' ||
        value === 'all' ||
        PARISHES.some((p) => p.value === value),
    )
    .optional()
    .default('all'),
})

export interface SubscribeState {
  ok: boolean
  message: string
}

const GENERIC_ERROR = 'Something went wrong. Please try again in a moment.'

export async function postSubscribe(
  data: unknown,
  opts: { apiBase: string; fetchImpl?: typeof fetch },
): Promise<SubscribeState> {
  const parsed = SubscribeSchema.safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Please enter a valid email address and choose an area.',
    }
  }
  const apiBase = opts.apiBase.replace(/\/+$/, '')
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(`${apiBase}/water-alerts/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { ok: false, message: GENERIC_ERROR }
    const body = z
      .object({ message: z.string().min(1) })
      .parse(await res.json())
    return { ok: true, message: body.message }
  } catch {
    return { ok: false, message: GENERIC_ERROR }
  }
}

export const subscribeWaterAlerts = createServerFn({ method: 'POST' })
  .validator((raw: unknown) => raw as Record<string, unknown>)
  .handler(
    async ({ data }): Promise<SubscribeState> =>
      postSubscribe(data, { apiBase: formsApiBase() }),
  )

export type TokenOutcome = 'done' | 'already' | 'invalid' | 'unavailable'

export async function callTokenEndpoint(
  kind: 'confirm' | 'unsubscribe',
  token: string,
  opts: { apiBase: string; fetchImpl?: typeof fetch },
): Promise<TokenOutcome> {
  if (!token) return 'invalid'
  const apiBase = opts.apiBase.replace(/\/+$/, '')
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(
      `${apiBase}/water-alerts/${kind}/${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000), cache: 'no-store' },
    )
    if (!res.ok) return 'unavailable'
    const body = z
      .object({ result: z.enum(['done', 'already', 'invalid']) })
      .parse(await res.json())
    return body.result
  } catch {
    return 'unavailable'
  }
}

export const confirmSubscription = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => (typeof raw === 'string' ? raw : ''))
  .handler(
    async ({ data }): Promise<TokenOutcome> =>
      callTokenEndpoint('confirm', data, { apiBase: formsApiBase() }),
  )

export const unsubscribeSubscription = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => (typeof raw === 'string' ? raw : ''))
  .handler(
    async ({ data }): Promise<TokenOutcome> =>
      callTokenEndpoint('unsubscribe', data, { apiBase: formsApiBase() }),
  )
