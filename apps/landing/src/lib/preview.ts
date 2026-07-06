import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  getRequest,
  setCookie,
} from '@tanstack/react-start/server'
import { useRuntimeConfig } from 'nitro/runtime-config'
import type { ViewLevel } from './frontmatter'

/**
 * View-level handling for the content rollout gate.
 *
 * There are three hierarchical levels (see `ViewLevel` in `frontmatter.ts`):
 * `public` < `preview` < `draft`. A higher grant subsumes the lower ones — a
 * `draft` reviewer also sees `preview` and `public` content.
 *
 * A reviewer unlocks content by visiting any URL with a matching token:
 *   - `?preview=<PREVIEW_SECRET>` grants `preview`,
 *   - `?draft=<DRAFT_SECRET>`     grants `draft`.
 * The two secrets are deliberately distinct: `draft` content is hidden even
 * from `preview`-token holders, so sharing one secret would let a preview
 * reviewer reach draft content just by swapping the query param. On a match the
 * server sets an httpOnly cookie holding only the granted *level* (never a
 * secret) and redirects to the same path with the token stripped, so the secret
 * never lingers in the URL or browser history. `?preview=exit` (or
 * `?draft=exit`) clears the cookie and sends the visitor home (the page they
 * were on may be gated and would otherwise 404 under them).
 *
 * httpOnly means client JS cannot forge the grant — a level can only be granted
 * by presenting the matching token to the server.
 */
const COOKIE_NAME = 'preview'

/** Reviewer grant cookie lifetime: 4 hours, in seconds. */
const COOKIE_MAX_AGE_SECONDS = 4 * 60 * 60

export interface ViewLevelResolution {
  /** The view level granted to the current request. */
  level: ViewLevel
  /** When set, the caller should redirect here (token consumed or cleared). */
  redirectTo?: string
}

/** What the adapter should do with the cookie: clear it, or set it to a level. */
type CookieAction = 'none' | 'clear' | 'preview' | 'draft'

interface ViewLevelDecision extends ViewLevelResolution {
  cookie: CookieAction
}

/**
 * Read the level a previously-set grant cookie carries. The cookie stores the
 * level name directly; a legacy `"1"` (the old boolean preview grant) is read
 * as `preview` so existing reviewer sessions keep working.
 */
export function levelFromCookie(value: string | undefined): ViewLevel {
  if (value === 'draft') return 'draft'
  if (value === 'preview' || value === '1') return 'preview'
  return 'public'
}

/**
 * Pure decision core, decoupled from the request/cookie helpers so it can be
 * tested without the server runtime. Given the request path, its query, the
 * `?preview=`/`?draft=` values, the level already granted by cookie, and the
 * two secrets, decide the resulting level, any redirect, and any cookie
 * mutation.
 *
 * `draft` outranks `preview`: when both tokens are presented (or both must be
 * checked), a valid draft token wins. An empty/undefined secret never matches,
 * so a misconfigured deploy fails closed — it cannot accidentally unlock.
 */
export function decideViewLevel({
  pathname,
  search,
  previewParam,
  draftParam,
  cookieLevel,
  previewSecret,
  draftSecret,
}: {
  pathname: string
  search: URLSearchParams
  previewParam: string | null
  draftParam: string | null
  cookieLevel: ViewLevel
  previewSecret: string | undefined
  draftSecret: string | undefined
}): ViewLevelDecision {
  if (previewParam === 'exit' || draftParam === 'exit') {
    return { level: 'public', redirectTo: '/', cookie: 'clear' }
  }

  if (previewParam !== null || draftParam !== null) {
    const next = new URLSearchParams(search)
    next.delete('preview')
    next.delete('draft')
    const qs = next.toString()
    const cleanUrl = qs ? `${pathname}?${qs}` : pathname

    // Draft outranks preview, so check it first.
    if (draftSecret && draftParam === draftSecret) {
      return { level: 'draft', redirectTo: cleanUrl, cookie: 'draft' }
    }
    if (previewSecret && previewParam === previewSecret) {
      return { level: 'preview', redirectTo: cleanUrl, cookie: 'preview' }
    }
    // Wrong token(s): strip them from the URL but leave any existing grant intact.
    return { level: cookieLevel, redirectTo: cleanUrl, cookie: 'none' }
  }

  return { level: cookieLevel, cookie: 'none' }
}

/**
 * The parent-domain the grant cookie is scoped to, so landing, forms and the
 * API share ONE cookie across `*.sandbox.alpha.gov.bb` / `*.alpha.gov.bb`
 * (#1646 Phase 3, ADR 0058). Build-baked via vite `runtimeConfig` in prod;
 * `process.env` in local dev (the same dual-source as the secrets above).
 * Empty/unset → undefined → host-only cookie, so local and per-PR Amplify
 * previews degrade gracefully to per-app URL tokens. The value MUST byte-match
 * the API's `PREVIEW_COOKIE_DOMAIN`, or the browser stores two separate cookies.
 */
export function previewCookieDomain(
  configValue: string | undefined,
  envValue: string | undefined,
): string | undefined {
  return configValue || envValue || undefined
}

export const resolveViewLevel = createServerFn().handler(
  async (): Promise<ViewLevelResolution> => {
    const url = new URL(getRequest().url)
    // Two sources per secret, because they reach the running server differently
    // per environment:
    //  - Production (Amplify): the SSR compute never sees Console env vars, so
    //    process.env is empty. We rely on the build-baked runtime config (see
    //    vite.config.ts), which inlines the value at build time.
    //  - Local dev: vite.config runs before .env is loaded, so the baked value
    //    is empty — but Nitro's dev server loads .env into process.env at
    //    runtime, so process.env carries it.
    const config = useRuntimeConfig()
    const decision = decideViewLevel({
      pathname: url.pathname,
      search: url.searchParams,
      previewParam: url.searchParams.get('preview'),
      draftParam: url.searchParams.get('draft'),
      cookieLevel: levelFromCookie(getCookie(COOKIE_NAME)),
      previewSecret:
        config.previewSecret || process.env.PREVIEW_SECRET || undefined,
      draftSecret: config.draftSecret || process.env.DRAFT_SECRET || undefined,
    })

    // The cookie's Domain must match on both set and delete (#1646 Phase 3): the
    // browser keys deletion by name+domain+path, so a domain-scoped grant can't
    // be cleared by `?preview=exit` unless the delete carries the same Domain.
    // Localized cast: the nitro runtime-config type may not surface the
    // freshly-added key until types regenerate.
    const cookieDomain = previewCookieDomain(
      (config as { previewCookieDomain?: string }).previewCookieDomain,
      process.env.PREVIEW_COOKIE_DOMAIN,
    )

    if (decision.cookie === 'preview' || decision.cookie === 'draft') {
      setCookie(COOKIE_NAME, decision.cookie, {
        domain: cookieDomain,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      })
    } else if (decision.cookie === 'clear') {
      deleteCookie(COOKIE_NAME, { domain: cookieDomain, path: '/' })
    }

    return { level: decision.level, redirectTo: decision.redirectTo }
  },
)
