/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../lib/search'
import { CHAT_URL } from '../lib/chat-url'
import { HomeHero } from './HomeHero'

const { navigateMock, suggestMock, trackEventMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  suggestMock: vi.fn(),
  trackEventMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))
vi.mock('../lib/analytics', () => ({ trackEvent: trackEventMock }))
vi.mock('../lib/search', () => ({ suggest: suggestMock }))

const HIT: SearchHit = {
  id: 'service:birth',
  title: 'Get a birth certificate',
  description: '',
  href: '/family-birth-relationships/get-birth-certificate',
  digital: false,
  kind: 'service',
}

const QUESTION = 'How do I get a birth certificate?'

function stubChatHealth(ok: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok })),
  )
}

function renderHero(questions = [QUESTION]) {
  return render(
    <HomeHero questions={questions} viewer="public" overlay={new Map()} />,
  )
}

const askInput = () => screen.getByRole('textbox', { name: 'Ask a question' })
const searchInput = () =>
  screen.getByRole('combobox', { name: 'Search services' })

let assignedHref: string | undefined

beforeEach(() => {
  navigateMock.mockReset()
  suggestMock.mockReset().mockReturnValue([HIT])
  trackEventMock.mockReset()
  assignedHref = undefined
  vi.stubGlobal('location', {
    set href(value: string) {
      assignedHref = value
    },
  })
  stubChatHealth(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HomeHero', () => {
  it('starts in Ask Assistant mode, with the questions to try', () => {
    renderHero()

    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Ask Assistant' })
        .checked,
    ).toBe(true)
    expect(askInput()).toBeTruthy()
    expect(
      screen.getByRole('link', { name: QUESTION }).getAttribute('href'),
    ).toBe(`${new URL('/', CHAT_URL)}?q=How+do+I+get+a+birth+certificate%3F`)
  })

  it('keeps typed text when switching modes', () => {
    renderHero()

    fireEvent.change(askInput(), { target: { value: 'passport' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    expect(searchInput()).toHaveProperty('value', 'passport')
    expect(suggestMock).not.toHaveBeenCalled()
  })

  it('offers no suggestions for search text after a trip through Ask', () => {
    renderHero()
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))
    fireEvent.input(searchInput(), { target: { value: 'birth' } })
    expect(suggestMock).toHaveBeenCalled()

    suggestMock.mockClear()
    fireEvent.click(screen.getByRole('radio', { name: 'Ask Assistant' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    expect(searchInput()).toHaveProperty('value', 'birth')
    expect(suggestMock).not.toHaveBeenCalled()
  })

  it('cuts carried-over text to the question limit when switching to Ask', () => {
    renderHero()
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))
    fireEvent.input(searchInput(), { target: { value: 'a'.repeat(2100) } })

    fireEvent.click(screen.getByRole('radio', { name: 'Ask Assistant' }))

    expect(askInput()).toHaveProperty('value', 'a'.repeat(2000))
  })

  it('sends a question to the chat without putting it in analytics', () => {
    renderHero()

    fireEvent.change(askInput(), { target: { value: '  Renew a passport  ' } })
    fireEvent.submit(askInput())

    expect(trackEventMock).toHaveBeenCalledWith('chat-submit', {
      source: 'home',
    })
    expect(assignedHref).toBe(`${new URL('/', CHAT_URL)}?q=Renew+a+passport`)
  })

  it.each(['', '   '])(
    'stays on the page and returns to the box when the question is %j',
    (value) => {
      renderHero()
      fireEvent.change(askInput(), { target: { value } })

      fireEvent.submit(askInput())

      expect(assignedHref).toBeUndefined()
      expect(trackEventMock).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(askInput())
    },
  )

  it('tracks a question picked from Try asking', () => {
    renderHero()

    fireEvent.click(screen.getByRole('link', { name: QUESTION }))

    expect(trackEventMock).toHaveBeenCalledWith('chat-suggestion', {
      question: QUESTION,
      source: 'home',
    })
  })

  it('lets a question be sent while the chat check is still running', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderHero()

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled,
    ).toBe(false)
  })

  it('sends an empty search to the services list', () => {
    renderHero()
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    fireEvent.submit(searchInput())

    expect(trackEventMock).toHaveBeenCalledWith('search-submit', {
      query: '',
      source: 'home',
    })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/services' })
  })

  it('searches for typed text, with suggestions as it is typed', () => {
    renderHero()
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    fireEvent.input(searchInput(), { target: { value: 'birth' } })
    expect(suggestMock).toHaveBeenLastCalledWith('birth', 'public', new Map())

    fireEvent.submit(searchInput())
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/search-results',
      search: { q: 'birth' },
    })
  })

  it('tracks and searches for a picked suggestion', () => {
    renderHero()
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))
    const input = searchInput()
    input.focus()
    fireEvent.input(input, { target: { value: 'birth' } })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(trackEventMock.mock.calls).toEqual([
      [
        'search-suggestion-select',
        {
          query: 'birth',
          title: HIT.title,
          href: HIT.href,
          position: 1,
          source: 'home',
        },
      ],
      ['search-submit', { query: HIT.title, source: 'home' }],
    ])
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/search-results',
      search: { q: HIT.title },
    })
  })

  it('offers Search instead of questions when the assistant is offline', async () => {
    stubChatHealth(false)
    renderHero()
    // Screen readers only announce changes inside a live region that was
    // already there, so the banner must land in the region the questions were in.
    const region = screen.getByText('Try asking:').closest('[role="status"]')
    expect(region).not.toBeNull()

    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' })
    await waitFor(() => expect(send.disabled).toBe(true))
    expect(screen.queryByRole('link', { name: QUESTION })).toBeNull()
    expect(
      screen
        .getByText('The assistant is not available right now.')
        .closest('[role="status"]'),
    ).toBe(region)

    fireEvent.change(askInput(), { target: { value: 'Renew a passport' } })
    fireEvent.submit(askInput())
    expect(assignedHref).toBeUndefined()

    fireEvent.click(
      screen.getByRole('button', { name: 'search for a service' }),
    )
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Search' }).checked,
    ).toBe(true)
    expect(document.activeElement).toBe(searchInput())
  })

  it('checks the chat again when the tab comes back', async () => {
    stubChatHealth(false)
    renderHero()
    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' })
    await waitFor(() => expect(send.disabled).toBe(true))

    stubChatHealth(true)
    fireEvent(window, new Event('focus'))

    await waitFor(() => expect(send.disabled).toBe(false))
    expect(screen.getByRole('link', { name: QUESTION })).toBeTruthy()
  })
})
