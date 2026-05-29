import { describe, expect, it } from 'vitest'
import { decidePreview } from './preview'

const SECRET = 's3cret'

function decide(opts: {
  path?: string
  query?: string
  param?: string | null
  hasValidCookie?: boolean
  secret?: string | undefined
}) {
  const search = new URLSearchParams(opts.query ?? '')
  return decidePreview({
    pathname: opts.path ?? '/a/b',
    search,
    paramValue: opts.param ?? search.get('preview'),
    hasValidCookie: opts.hasValidCookie ?? false,
    secret: 'secret' in opts ? opts.secret : SECRET,
  })
}

describe('decidePreview', () => {
  it('grants preview and sets the cookie for the matching token', () => {
    expect(decide({ query: 'preview=s3cret' })).toEqual({
      preview: true,
      redirectTo: '/a/b',
      cookie: 'set',
    })
  })

  it('strips only the preview param from the redirect, keeping other query', () => {
    const d = decide({ path: '/x', query: 'q=hello&preview=s3cret' })
    expect(d.cookie).toBe('set')
    expect(d.redirectTo).toBe('/x?q=hello')
  })

  it('clears the cookie and sends home on exit', () => {
    expect(decide({ query: 'preview=exit', hasValidCookie: true })).toEqual({
      preview: false,
      redirectTo: '/',
      cookie: 'clear',
    })
  })

  it('ignores a wrong token but still strips it, preserving an existing grant', () => {
    expect(decide({ query: 'preview=nope', hasValidCookie: true })).toEqual({
      preview: true,
      redirectTo: '/a/b',
      cookie: 'none',
    })
  })

  it('a wrong token without a prior grant stays public', () => {
    expect(decide({ query: 'preview=nope', hasValidCookie: false })).toEqual({
      preview: false,
      redirectTo: '/a/b',
      cookie: 'none',
    })
  })

  it('never grants preview when no secret is configured, even if the param is empty-string-like', () => {
    const d = decide({ query: 'preview=anything', secret: undefined })
    expect(d.preview).toBe(false)
    expect(d.cookie).toBe('none')
  })

  it('reads the grant from the cookie when no param is present', () => {
    expect(decide({ hasValidCookie: true })).toEqual({
      preview: true,
      cookie: 'none',
    })
    expect(decide({ hasValidCookie: false })).toEqual({
      preview: false,
      cookie: 'none',
    })
  })
})
