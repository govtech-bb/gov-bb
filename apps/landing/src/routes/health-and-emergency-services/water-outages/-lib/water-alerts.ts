import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { formsApiBase } from '../../../../lib/forms-api-url'
import type { Outage } from './outages'

export interface WaterOutagesData {
  outages: Outage[]
  /** ISO instant the API read the feed. */
  checkedAt: string | null
  /** Server timestamp used for all "is it past / today" calcs, so SSR and
   *  client render identically. */
  now: number
  /** True when the BWA feed was unreachable — show the honest paused state. */
  failed: boolean
}

/** SSR loader data: parsed BWA notices from the API (GET /water-alerts/outages). */
export const getWaterOutages = createServerFn().handler(
  async (): Promise<WaterOutagesData> => {
    const now = Date.now()
    try {
      const res = await fetch(`${formsApiBase()}/water-alerts/outages`)
      if (!res.ok) return { outages: [], checkedAt: null, now, failed: true }
      const data = (await res.json()) as {
        outages: Outage[]
        checkedAt?: string
      }
      return {
        outages: data.outages ?? [],
        checkedAt: data.checkedAt ?? null,
        now,
        failed: false,
      }
    } catch {
      return { outages: [], checkedAt: null, now, failed: true }
    }
  },
)

const SubscribeSchema = z.object({
  email: z.string(),
  area: z.string().optional().default('all'),
})

export interface SubscribeState {
  ok: boolean
  message: string
}

const GENERIC_ERROR = 'Something went wrong. Please try again in a moment.'

/** Pure, testable subscribe call — the real API base is injected by the handler. */
export async function postSubscribe(
  data: unknown,
  opts: { apiBase: string; fetchImpl?: typeof fetch },
): Promise<SubscribeState> {
  const parsed = SubscribeSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, message: 'Please enter a valid email address.' }
  }
  const apiBase = opts.apiBase.replace(/\/+$/, '')
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(`${apiBase}/water-alerts/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    })
    if (!res.ok) return { ok: false, message: GENERIC_ERROR }
    const body = (await res.json()) as { message?: string }
    return {
      ok: true,
      message:
        body.message ??
        'Almost done. Check your email and click the link to confirm.',
    }
  } catch {
    return { ok: false, message: GENERIC_ERROR }
  }
}

/** Sign up for water alerts (POST /water-alerts/subscribe). */
export const subscribeWaterAlerts = createServerFn({ method: 'POST' })
  .validator((raw: unknown) => raw as Record<string, unknown>)
  .handler(
    async ({ data }): Promise<SubscribeState> =>
      postSubscribe(data, { apiBase: formsApiBase() }),
  )
