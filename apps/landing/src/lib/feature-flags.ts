import { createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  getRequestUrl,
  setCookie,
} from '@tanstack/react-start/server'
import { notFound, redirect } from '@tanstack/react-router'
import { FEATURE_FLAGS } from './feature-flags.config'

const INTERNAL_COOKIE = 'govbb_preview'
const INTERNAL_QUERY_PARAM = 'p'
// Shared-link obscurity, not an auth mechanism. Anyone with the URL gets in.
// Do not add per-user logic or treat this as a secret.
const INTERNAL_TOKEN = 'preview-2026-x7k2'
const INTERNAL_COOKIE_MAX_AGE = 60 * 60 * 8

type InternalResult = { ok: true } | { ok: false; redirectTo?: string }

// HttpOnly cookie + request URL are server-only — beforeLoad runs on the
// client during SPA navigation, so this path must bounce through the server.
const resolveInternal = createServerFn({ method: 'GET' }).handler(
  (): InternalResult => {
    const url = getRequestUrl()
    const queryToken = url.searchParams.get(INTERNAL_QUERY_PARAM)
    const cookieToken = getCookie(INTERNAL_COOKIE)

    if (queryToken === INTERNAL_TOKEN) {
      setCookie(INTERNAL_COOKIE, INTERNAL_TOKEN, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: INTERNAL_COOKIE_MAX_AGE,
      })
      url.searchParams.delete(INTERNAL_QUERY_PARAM)
      return {
        ok: false,
        redirectTo: url.pathname + url.search + url.hash,
      }
    }
    if (cookieToken === INTERNAL_TOKEN) return { ok: true }
    return { ok: false }
  },
)

export async function checkFeatureFlag(name: string): Promise<void> {
  const value = FEATURE_FLAGS[name]
  if (!value) return
  if (value === '404') throw notFound()
  if (value === 'unavailable') throw redirect({ to: '/service-unavailable' })

  const result = await resolveInternal()
  if (result.ok) return
  if (result.redirectTo) {
    throw redirect({ href: result.redirectTo, replace: true })
  }
  throw notFound()
}
