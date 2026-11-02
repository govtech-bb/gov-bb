import { describe, expect, it } from 'vitest'
import {
  decideViewLevel,
  levelFromCookie,
  previewCookieDomain,
} from './preview'
import type { ViewLevel } from './frontmatter'

const PREVIEW = 'preview-s3cret'

function decide(opts: {
  path?: string
  query?: string
  previewParam?: string | null
  cookieLevel?: ViewLevel
  previewSecret?: string | undefined
}) {
  const search = new URLSearchParams(opts.query ?? '')
  return decideViewLevel({
    pathname: opts.path ?? '/a/b',
    search,
    previewParam:
      'previewParam' in opts
        ? (opts.previewParam ?? null)
        : search.get('preview'),
    cookieLevel: opts.cookieLevel ?? 'public',
    previewSecret: 'previewSecret' in opts ? opts.previewSecret : PREVIEW,
  })
}

describe('levelFromCookie', () => {
  it('maps the stored level name back to a ViewLevel', () => {
    expect(levelFromCookie('preview')).toBe('preview')
  })

  it('reads the legacy boolean grant "1" as preview', () => {
    expect(levelFromCookie('1')).toBe('preview')
  })

  it('treats an absent or unknown cookie as public', () => {
    expect(levelFromCookie(undefined)).toBe('public')
    expect(levelFromCookie('nonsense')).toBe('public')
    expect(levelFromCookie('draft')).toBe('public')
  })
})

describe('previewCookieDomain', () => {
  it('prefers the build-baked config value', () => {
    expect(previewCookieDomain('.alpha.gov.bb', '.sandbox.alpha.gov.bb')).toBe(
      '.alpha.gov.bb',
    )
  })

  it('falls back to the env value when the config value is empty', () => {
    expect(previewCookieDomain('', '.sandbox.alpha.gov.bb')).toBe(
      '.sandbox.alpha.gov.bb',
    )
    expect(previewCookieDomain(undefined, '.sandbox.alpha.gov.bb')).toBe(
      '.sandbox.alpha.gov.bb',
    )
  })

  it('returns undefined (host-only cookie) when neither is set', () => {
    expect(previewCookieDomain('', '')).toBeUndefined()
    expect(previewCookieDomain(undefined, undefined)).toBeUndefined()
  })
})

describe('decideViewLevel', () => {
  it('grants preview and sets the preview cookie for a matching preview token', () => {
    expect(decide({ query: `preview=${PREVIEW}` })).toEqual({
      level: 'preview',
      redirectTo: '/a/b',
      cookie: 'preview',
    })
  })

  it('strips the preview param from the redirect, keeping other query', () => {
    const d = decide({ path: '/x', query: `q=hello&preview=${PREVIEW}` })
    expect(d.cookie).toBe('preview')
    expect(d.redirectTo).toBe('/x?q=hello')
  })

  it('clears the cookie and sends home on preview=exit', () => {
    expect(decide({ query: 'preview=exit', cookieLevel: 'preview' })).toEqual({
      level: 'public',
      redirectTo: '/',
      cookie: 'clear',
    })
  })

  it('ignores a wrong token but still strips it, preserving an existing grant', () => {
    expect(decide({ query: 'preview=nope', cookieLevel: 'preview' })).toEqual({
      level: 'preview',
      redirectTo: '/a/b',
      cookie: 'none',
    })
  })

  it('a wrong token without a prior grant stays public', () => {
    expect(decide({ query: 'preview=nope', cookieLevel: 'public' })).toEqual({
      level: 'public',
      redirectTo: '/a/b',
      cookie: 'none',
    })
  })

  it('never grants when the matching secret is unconfigured', () => {
    expect(
      decide({ query: `preview=${PREVIEW}`, previewSecret: undefined }),
    ).toMatchObject({ level: 'public', cookie: 'none' })
  })

  it('reads the granted level from the cookie when no param is present', () => {
    expect(decide({ cookieLevel: 'preview' })).toEqual({
      level: 'preview',
      cookie: 'none',
    })
    expect(decide({ cookieLevel: 'public' })).toEqual({
      level: 'public',
      cookie: 'none',
    })
  })
})
