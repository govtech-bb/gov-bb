import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const config = parse(
  readFileSync(new URL('../../../../amplify.yml', import.meta.url), 'utf8'),
) as {
  applications: Array<{
    appRoot: string
    frontend: {
      customHeaders: Array<{
        pattern: string
        headers: Array<{ key: string; value: string }>
      }>
    }
  }>
}

describe('embedding headers after legacy preview removal', () => {
  it.each([
    ['apps/landing', 'frame-ancestors'],
    ['apps/form_builder', 'frame-src'],
  ])('blocks %s embedding with %s', (appRoot, directive) => {
    const headers = config.applications
      .find((app) => app.appRoot === appRoot)
      ?.frontend.customHeaders.find(
        (entry) => entry.pattern === '**/*',
      )?.headers
    expect(headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' })
    const csp = headers?.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value
    expect(csp?.split(';').map((part) => part.trim())).toContain(
      `${directive} 'none'`,
    )
    if (appRoot === 'apps/form_builder') {
      expect(csp).toContain('https://forms.api.sandbox.alpha.gov.bb')
      expect(csp).toContain("img-src 'self' data: blob:")
    }
  })
})
