import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentPropsWithoutRef } from 'react'
import type * as ReactRouter from '@tanstack/react-router'
import { Breadcrumbs } from './Breadcrumbs'

type MockLinkProps = ComponentPropsWithoutRef<'a'> & { to: string }

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  Link: ({ to, ...props }: MockLinkProps) => <a href={to} {...props} />,
}))

describe('Breadcrumbs', () => {
  it('renders Home plus all but the last crumb, with correct hrefs', () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs
        breadcrumbs={[
          {
            name: 'Family, birth and relationships',
            url: 'family-birth-relationships',
          },
          {
            name: 'Get a copy of a birth certificate',
            url: 'family-birth-relationships/get-birth-certificate',
          },
          {
            name: 'Get a copy of a birth certificate',
            url: 'family-birth-relationships/get-birth-certificate/start',
          },
        ]}
      />,
    )

    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/family-birth-relationships"')
    expect(html).toContain(
      'href="/family-birth-relationships/get-birth-certificate"',
    )
    expect(html).not.toContain(
      'href="/family-birth-relationships/get-birth-certificate/start"',
    )
    expect(html).toContain('>Home<')
    expect(html).toContain('>Family, birth and relationships<')
    expect(html).toContain('>Get a copy of a birth certificate<')
  })

  it('renders nothing for an empty list', () => {
    const html = renderToStaticMarkup(<Breadcrumbs breadcrumbs={[]} />)
    expect(html).toBe('')
  })
})
