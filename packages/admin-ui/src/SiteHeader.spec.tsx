import { render, screen } from '@testing-library/react'
import { SiteHeader } from './SiteHeader'

describe('SiteHeader', () => {
  it('renders the label and the Government of Barbados logo', () => {
    render(<SiteHeader label="Service visibility" />)
    expect(screen.getByText('Service visibility')).toBeInTheDocument()
    // DS Logo renders an <svg role="img"> with the wordmark viewBox.
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 276 27')
  })

  it('links the wordmark to homeHref (default "/")', () => {
    const { rerender } = render(<SiteHeader label="X" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    rerender(<SiteHeader label="X" homeHref="/dashboard" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard')
  })

  it('renders children in the right slot', () => {
    render(
      <SiteHeader label="X">
        <button type="button">Sign out</button>
      </SiteHeader>,
    )
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
