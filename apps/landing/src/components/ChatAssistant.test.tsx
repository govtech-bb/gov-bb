/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatAssistant } from './ChatAssistant'

vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ChatAssistant', () => {
  it('keeps free-text chat available without suggested questions', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true })),
    )
    render(<ChatAssistant questions={[]} />)

    expect(
      screen.getByRole('textbox', { name: 'Ask the government assistant' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(
      screen.queryByRole('heading', { name: 'Questions you can ask:' }),
    ).toBeNull()
  })

  it('renders only the supplied public questions', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true })),
    )
    render(<ChatAssistant questions={['How do I get a birth certificate?']} />)

    expect(
      screen.getByRole('button', { name: 'How do I get a birth certificate?' }),
    ).toBeTruthy()
  })
})
