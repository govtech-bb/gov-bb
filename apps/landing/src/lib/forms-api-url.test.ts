import { describe, expect, it } from 'vitest'
import { resolveFormsApiBase } from './forms-api-url'

describe('resolveFormsApiBase', () => {
  it('prefers the runtimeConfig value over the env value', () => {
    expect(
      resolveFormsApiBase('https://config.example', 'https://env.example'),
    ).toBe('https://config.example')
  })

  it('falls back to the env value when runtimeConfig is unset', () => {
    expect(resolveFormsApiBase(undefined, 'https://env.example')).toBe(
      'https://env.example',
    )
  })

  it('treats an empty-string runtimeConfig value as unset', () => {
    expect(resolveFormsApiBase('', 'https://env.example')).toBe(
      'https://env.example',
    )
  })

  it('trims trailing slashes so path concatenation never doubles', () => {
    expect(resolveFormsApiBase('https://api.example///', undefined)).toBe(
      'https://api.example',
    )
  })

  it('throws when neither source is set (no silent sandbox default)', () => {
    expect(() => resolveFormsApiBase(undefined, undefined)).toThrow(
      /VITE_FORMS_API_URL is not set/,
    )
    expect(() => resolveFormsApiBase('', '')).toThrow(
      /VITE_FORMS_API_URL is not set/,
    )
  })
})
