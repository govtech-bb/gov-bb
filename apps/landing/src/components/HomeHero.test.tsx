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
    // Carried-over text is not typed text, so it gets no suggestions.
    expect(suggestMock).not.toHaveBeenCalled()
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

  it('stays on the page when the question is empty', () => {
    renderHero()

    fireEvent.submit(askInput())

    expect(assignedHref).toBeUndefined()
    expect(trackEventMock).not.toHaveBeenCalled()
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

  it('offers Search instead of questions when the assistant is offline', async () => {
    stubChatHealth(false)
    renderHero()

    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' })
    await waitFor(() => expect(send.disabled).toBe(true))
    expect(screen.queryByRole('link', { name: QUESTION })).toBeNull()

    fireEvent.change(askInput(), { target: { value: 'Renew a passport' } })
    fireEvent.submit(askInput())
    expect(assignedHref).toBeUndefined()

    fireEvent.click(
      screen.getByRole('button', { name: 'Search for a service instead' }),
    )
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Search' }).checked,
    ).toBe(true)
    expect(document.activeElement).toBe(searchInput())
  })
})
