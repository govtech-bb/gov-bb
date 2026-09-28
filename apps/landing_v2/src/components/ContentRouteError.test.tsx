import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CONTENT_API_UNREACHABLE, ContentRouteError } from './ContentRouteError'

function render(error: Error): string {
  return renderToStaticMarkup(
    <ContentRouteError error={error} reset={() => {}} />,
  )
}

describe('ContentRouteError', () => {
  it('renders the temporarily-unavailable page for an unreachable content API', () => {
    const html = render(new Error(CONTENT_API_UNREACHABLE))

    expect(html).toContain('This service is temporarily unavailable')
    expect(html).toContain('Return to homepage')
    expect(html).not.toContain('Contact us')
    expect(html).not.toContain('Something went wrong on our end')
  })

  it('renders the server error page for any other error', () => {
    const html = render(new Error('boom'))

    expect(html).toContain('Something went wrong on our end')
    expect(html).not.toContain('temporarily unavailable')
  })
})
