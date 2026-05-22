import { notFound } from '@tanstack/react-router'
import { findPage } from '../content/registry'

export type PreviewAction =
  | { kind: 'set'; token: string; redirectTo: string }
  | { kind: 'clear'; redirectTo: string }
  | { kind: 'strip'; redirectTo: string }
  | { kind: 'none' }

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function stripPreviewParam(url: URL): string {
  const cleaned = new URL(url.toString())
  cleaned.searchParams.delete('preview')
  const search = cleaned.searchParams.toString()
  return cleaned.pathname + (search ? `?${search}` : '') + cleaned.hash
}

/**
 * Pure decision: given the request URL and the configured token (or undefined
 * when no token is configured), return what cookie action — if any — to take.
 *
 * - `?preview=exit` clears the cookie regardless of token configuration.
 * - `?preview={value}` sets the cookie when {value} matches the configured token.
 * - Any other `?preview=…` value is stripped from the URL without setting a
 *   cookie. Stripping the param prevents tokens from sticking around in URLs,
 *   referrers, and access logs.
 */
export function decidePreviewAction(
  url: URL,
  validToken: string | undefined,
): PreviewAction {
  const param = url.searchParams.get('preview')
  if (param === null) return { kind: 'none' }

  const redirectTo = stripPreviewParam(url)

  if (param === 'exit') return { kind: 'clear', redirectTo }

  if (validToken && constantTimeEqual(param, validToken)) {
    return { kind: 'set', token: validToken, redirectTo }
  }

  return { kind: 'strip', redirectTo }
}

/**
 * Throw `notFound()` when the form route's parent content page is gated
 * (draft or protected) and the request lacks a valid preview cookie.
 *
 * `parentPageUrl` is the parent page's canonical URL (no leading slash),
 * e.g. "money-financial-support/calculate-severance-pay".
 */
export function requireFormAccess(
  parentPageUrl: string,
  previewMode: boolean,
): void {
  if (previewMode) return
  const page = findPage(parentPageUrl)
  if (!page) return
  if (page.frontmatter.draft || page.frontmatter.protected) {
    throw notFound()
  }
}
