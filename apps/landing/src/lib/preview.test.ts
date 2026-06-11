import { describe, expect, it } from 'vitest'
import { decideViewLevel, levelFromCookie } from './preview'
import type { ViewLevel } from './frontmatter'

const PREVIEW = 'preview-s3cret'
const DRAFT = 'draft-s3cret'

function decide(opts: {
  path?: string
  query?: string
  previewParam?: string | null
  draftParam?: string | null
  cookieLevel?: ViewLevel
  previewSecret?: string | undefined
  draftSecret?: string | undefined
}) {
  const search = new URLSearchParams(opts.query ?? '')
  return decideViewLevel({
    pathname: opts.path ?? '/a/b',
    search,
    previewParam:
      'previewParam' in opts
        ? (opts.previewParam ?? null)
        : search.get('preview'),
    draftParam:
      'draftParam' in opts ? (opts.draftParam ?? null) : search.get('draft'),
    cookieLevel: opts.cookieLevel ?? 'public',
    previewSecret: 'previewSecret' in opts ? opts.previewSecret : PREVIEW,
    draftSecret: 'draftSecret' in opts ? opts.draftSecret : DRAFT,
  })
}

describe('levelFromCookie', () => {
  it('maps the stored level name back to a ViewLevel', () => {
    expect(levelFromCookie('preview')).toBe('preview')
    expect(levelFromCookie('draft')).toBe('draft')
  })

  it('reads the legacy boolean grant "1" as preview', () => {
    expect(levelFromCookie('1')).toBe('preview')
  })

  it('treats an absent or unknown cookie as public', () => {
    expect(levelFromCookie(undefined)).toBe('public')
    expect(levelFromCookie('nonsense')).toBe('public')
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

  it('grants draft and sets the draft cookie for a matching draft token', () => {
    expect(decide({ query: `draft=${DRAFT}` })).toEqual({
      level: 'draft',
      redirectTo: '/a/b',
      cookie: 'draft',
    })
  })

  it('does not grant draft for the preview token (the secrets are distinct)', () => {
    // A preview reviewer trying the draft param with the secret they know.
    expect(decide({ draftParam: PREVIEW })).toEqual({
      level: 'public',
      redirectTo: '/a/b',
      cookie: 'none',
    })
  })

  it('lets draft win when both tokens are presented', () => {
    expect(decide({ query: `preview=${PREVIEW}&draft=${DRAFT}` })).toEqual({
      level: 'draft',
      redirectTo: '/a/b',
      cookie: 'draft',
    })
  })

  it('strips both preview and draft params from the redirect, keeping other query', () => {
    const d = decide({ path: '/x', query: `q=hello&draft=${DRAFT}` })
    expect(d.cookie).toBe('draft')
    expect(d.redirectTo).toBe('/x?q=hello')
  })

  it('clears the cookie and sends home on preview=exit', () => {
    expect(decide({ query: 'preview=exit', cookieLevel: 'draft' })).toEqual({
      level: 'public',
      redirectTo: '/',
      cookie: 'clear',
    })
  })

  it('clears the cookie and sends home on draft=exit', () => {
    expect(decide({ query: 'draft=exit', cookieLevel: 'preview' })).toEqual({
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
    expect(decide({ query: 'draft=nope', cookieLevel: 'public' })).toEqual({
      level: 'public',
      redirectTo: '/a/b',
      cookie: 'none',
    })
  })

  it('never grants when the matching secret is unconfigured', () => {
    expect(
      decide({ query: `draft=${DRAFT}`, draftSecret: undefined }),
    ).toMatchObject({ level: 'public', cookie: 'none' })
    expect(
      decide({ query: `preview=${PREVIEW}`, previewSecret: undefined }),
    ).toMatchObject({ level: 'public', cookie: 'none' })
  })

  it('reads the granted level from the cookie when no param is present', () => {
    expect(decide({ cookieLevel: 'draft' })).toEqual({
      level: 'draft',
      cookie: 'none',
    })
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
