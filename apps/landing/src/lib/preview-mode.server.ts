import {
  deleteCookie,
  getCookie,
  getRequestUrl,
  setCookie,
} from '@tanstack/react-start/server'
import { constantTimeEqual, decidePreviewAction } from './preview-mode'

const COOKIE_NAME = 'landing_preview'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function getValidToken(): string | undefined {
  const token = process.env.LANDING_PREVIEW_TOKEN
  return token && token.length > 0 ? token : undefined
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Server-side. Returns true when the request carries a valid preview cookie.
 * Returns false when no token is configured (preview disabled at env level).
 */
export function isPreviewMode(): boolean {
  const validToken = getValidToken()
  if (!validToken) return false
  const cookieValue = getCookie(COOKIE_NAME)
  if (!cookieValue) return false
  return constantTimeEqual(cookieValue, validToken)
}

/**
 * Server-side. Handle `?preview=…` on the current request: set or clear the
 * preview cookie as appropriate. Returns the URL to redirect to (the same URL
 * minus the preview query param) when any action was taken, or undefined when
 * the URL has no preview param and nothing needs to change.
 */
export function handlePreviewQuery(): string | undefined {
  const action = decidePreviewAction(getRequestUrl(), getValidToken())

  switch (action.kind) {
    case 'none':
      return undefined
    case 'clear':
      deleteCookie(COOKIE_NAME, { path: '/' })
      return action.redirectTo
    case 'set':
      setCookie(COOKIE_NAME, action.token, {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      })
      return action.redirectTo
    case 'strip':
      return action.redirectTo
  }
}
