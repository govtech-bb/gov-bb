import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  getRequest,
  setCookie,
  setResponseStatus,
} from '@tanstack/react-start/server'

/**
 * Feature-flag-token handling for the content rollout gate.
 *
 * A reviewer unlocks `flag: 'flagged'` content by visiting any URL with
 * `?flag=<token>` where the token matches `FLAG_SECRET` (a server-only env
 * var — never `VITE_`-prefixed, so it is not shipped to the client). On a
 * match the server sets an httpOnly cookie and redirects to the same path
 * with the token stripped, so the secret never lingers in the URL or browser
 * history. `?flag=exit` clears the cookie and sends the visitor home (the
 * page they were on may be flag-only and would otherwise 404 under them).
 *
 * The cookie holds only the boolean grant ("1"), never the secret. httpOnly
 * means client JS cannot forge it — the flag can only be granted by
 * presenting the token to the server.
 */
export const COOKIE_NAME = 'flag'
const COOKIE_VALUE = '1'

export interface FlagResolution {
  /** Whether the current request is in flag-reviewer mode. */
  flag: boolean
  /** When set, the caller should redirect here (token consumed or cleared). */
  redirectTo?: string
}

type CookieAction = 'set' | 'clear' | 'none'

interface FlagDecision extends FlagResolution {
  /** What the adapter should do with the cookie. */
  cookie: CookieAction
}

/**
 * Pure decision core, decoupled from the request/cookie helpers so it can be
 * tested without the server runtime. Given the request path, its query, the
 * `?flag=` value and whether a valid grant cookie is already present, decide
 * the resulting flag state, any redirect, and any cookie mutation.
 */
export function decideFlag({
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
}): FlagDecision {
  if (paramValue === 'exit') {
    return { flag: false, redirectTo: '/', cookie: 'clear' }
  }

  if (paramValue) {
    const next = new URLSearchParams(search)
    next.delete('flag')
    const qs = next.toString()
    const cleanUrl = qs ? `${pathname}?${qs}` : pathname
    if (secret && paramValue === secret) {
      return { flag: true, redirectTo: cleanUrl, cookie: 'set' }
    }
    // Wrong token: strip it from the URL but leave any existing grant intact.
    return { flag: hasValidCookie, redirectTo: cleanUrl, cookie: 'none' }
  }

  return { flag: hasValidCookie, cookie: 'none' }
}

/**
 * Server function used by the splat loader to set HTTP 503 on the response
 * when it renders the "this page isn't available yet" page for a
 * published-but-flagged service. Lives here (alongside other server-only
 * helpers) so route files don't try to import `@tanstack/react-start/server`
 * directly — the bundler blocks that.
 */
export const markFlaggedResponse = createServerFn().handler(async () => {
  setResponseStatus(503)
})

export const resolveFlag = createServerFn().handler(
  async (): Promise<FlagResolution> => {
    const url = new URL(getRequest().url)
    const decision = decideFlag({
      pathname: url.pathname,
      search: url.searchParams,
      paramValue: url.searchParams.get('flag'),
      hasValidCookie: getCookie(COOKIE_NAME) === COOKIE_VALUE,
      secret: process.env.FLAG_SECRET,
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

    return { flag: decision.flag, redirectTo: decision.redirectTo }
  },
)
