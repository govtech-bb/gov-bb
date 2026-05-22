import { describe, it, expect } from 'vitest'
import {
  constantTimeEqual,
  decidePreviewAction,
  stripPreviewParam,
} from './preview-mode'

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('secret', 'secret')).toBe(true)
  })
  it('returns false for different strings of the same length', () => {
    expect(constantTimeEqual('secret', 'sekret')).toBe(false)
  })
  it('returns false for different lengths', () => {
    expect(constantTimeEqual('secret', 'secrets')).toBe(false)
  })
  it('handles empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true)
    expect(constantTimeEqual('', 'x')).toBe(false)
  })
})

describe('stripPreviewParam', () => {
  it('removes the preview query param', () => {
    const url = new URL('https://gov.bb/services?preview=token123')
    expect(stripPreviewParam(url)).toBe('/services')
  })
  it('preserves other query params', () => {
    const url = new URL('https://gov.bb/search?q=birth&preview=t&page=2')
    expect(stripPreviewParam(url)).toBe('/search?q=birth&page=2')
  })
  it('preserves the hash', () => {
    const url = new URL('https://gov.bb/page?preview=t#section')
    expect(stripPreviewParam(url)).toBe('/page#section')
  })
  it('handles no query at all', () => {
    const url = new URL('https://gov.bb/page')
    expect(stripPreviewParam(url)).toBe('/page')
  })
})

describe('decidePreviewAction', () => {
  it('returns none when no preview param', () => {
    const url = new URL('https://gov.bb/services')
    expect(decidePreviewAction(url, 'token')).toEqual({ kind: 'none' })
  })

  it('returns set when token matches', () => {
    const url = new URL('https://gov.bb/services?preview=token')
    expect(decidePreviewAction(url, 'token')).toEqual({
      kind: 'set',
      token: 'token',
      redirectTo: '/services',
    })
  })

  it('returns strip when token mismatches', () => {
    const url = new URL('https://gov.bb/services?preview=wrong')
    expect(decidePreviewAction(url, 'token')).toEqual({
      kind: 'strip',
      redirectTo: '/services',
    })
  })

  it('returns strip when no token is configured and any value is passed', () => {
    const url = new URL('https://gov.bb/services?preview=anything')
    expect(decidePreviewAction(url, undefined)).toEqual({
      kind: 'strip',
      redirectTo: '/services',
    })
  })

  it('returns clear for ?preview=exit even when no token is configured', () => {
    const url = new URL('https://gov.bb/services?preview=exit')
    expect(decidePreviewAction(url, undefined)).toEqual({
      kind: 'clear',
      redirectTo: '/services',
    })
  })

  it('returns clear for ?preview=exit when a token is configured', () => {
    const url = new URL('https://gov.bb/services?preview=exit')
    expect(decidePreviewAction(url, 'token')).toEqual({
      kind: 'clear',
      redirectTo: '/services',
    })
  })

  it('preserves other query params on the redirect URL', () => {
    const url = new URL('https://gov.bb/search?q=birth&preview=token&page=2')
    expect(decidePreviewAction(url, 'token')).toEqual({
      kind: 'set',
      token: 'token',
      redirectTo: '/search?q=birth&page=2',
    })
  })
})
