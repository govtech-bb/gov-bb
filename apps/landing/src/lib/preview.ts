import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  getRequest,
  setCookie,
} from '@tanstack/react-start/server'
import { useRuntimeConfig } from 'nitro/runtime-config'

/**
 * Preview-token handling for the content rollout gate.
 *
 * A reviewer unlocks `visibility: preview` content by visiting any URL with
 * `?preview=<token>` where the token matches `PREVIEW_SECRET` (a server-only
 * env var — never `VITE_`-prefixed, so it is not shipped to the client). On a
 * match the server sets an httpOnly cookie and redirects to the same path with
 * the token stripped, so the secret never lingers in the URL or browser
 * history. `?preview=exit` clears the cookie and sends the visitor home (the
 * page they were on may be preview-only and would otherwise 404 under them).
 *
 * The cookie holds only the boolean grant ("1"), never the secret. httpOnly
 * means client JS cannot forge it — preview can only be granted by presenting
 * the token to the server.
 */
export const COOKIE_NAME = 'preview'
const COOKIE_VALUE = '1'

export interface PreviewResolution {
  /** Whether the current request is in preview mode. */
  preview: boolean
  /** When set, the caller should redirect here (token consumed or cleared). */
  redirectTo?: string
}

type CookieAction = 'set' | 'clear' | 'none'

interface PreviewDecision extends PreviewResolution {
  /** What the adapter should do with the cookie. */
  cookie: CookieAction
}

/**
 * Pure decision core, decoupled from the request/cookie helpers so it can be
 * tested without the server runtime. Given the request path, its query, the
 * `?preview=` value and whether a valid grant cookie is already present, decide
 * the resulting preview state, any redirect, and any cookie mutation.
 */
export function decidePreview({
  pathname,
  search,
  paramValue,
  hasValidCookie,
  secret,
}: {
  pathname: string
  search: URLSearchParams
  paramValue: string | null
  hasValidCookie: boolean
  secret: string | undefined
}): PreviewDecision {
  if (paramValue === 'exit') {
    return { preview: false, redirectTo: '/', cookie: 'clear' }
  }

  if (paramValue) {
    const next = new URLSearchParams(search)
    next.delete('preview')
    const qs = next.toString()
    const cleanUrl = qs ? `${pathname}?${qs}` : pathname
    if (secret && paramValue === secret) {
      return { preview: true, redirectTo: cleanUrl, cookie: 'set' }
    }
    // Wrong token: strip it from the URL but leave any existing grant intact.
    return { preview: hasValidCookie, redirectTo: cleanUrl, cookie: 'none' }
  }

  return { preview: hasValidCookie, cookie: 'none' }
}

export const resolvePreview = createServerFn().handler(
  async (): Promise<PreviewResolution> => {
    const url = new URL(getRequest().url)
    const decision = decidePreview({
      pathname: url.pathname,
      search: url.searchParams,
      paramValue: url.searchParams.get('preview'),
      hasValidCookie: getCookie(COOKIE_NAME) === COOKIE_VALUE,
      // Two sources, because the secret reaches the running server differently
      // per environment:
      //  - Production (Amplify): the SSR compute never sees Console env vars, so
      //    process.env is empty. We rely on the build-baked runtime config (see
      //    vite.config.ts), which inlines the value at build time.
      //  - Local dev: vite.config runs before .env is loaded, so the baked value
      //    is empty — but Nitro's dev server loads .env into process.env at
      //    runtime, so process.env carries it.
      // An empty result fails closed: decidePreview never matches an empty
      // secret, so a misconfigured deploy can't accidentally unlock.
      secret:
        useRuntimeConfig().previewSecret ||
        process.env.PREVIEW_SECRET ||
        undefined,
    })

    if (decision.cookie === 'set') {
      setCookie(COOKIE_NAME, COOKIE_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      })
    } else if (decision.cookie === 'clear') {
      deleteCookie(COOKIE_NAME)
    }

    return { preview: decision.preview, redirectTo: decision.redirectTo }
  },
)
