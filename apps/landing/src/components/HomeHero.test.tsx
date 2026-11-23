/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

function renderHero(
  questions = [QUESTION],
  overlay: ReadonlyMap<string, 'public' | 'preview'> = new Map(),
) {
  return render(
    <HomeHero questions={questions} viewer="public" overlay={overlay} />,
  )
}

const askInput = () => screen.getByRole('textbox', { name: 'Ask a question' })
const searchInput = () =>
  screen.getByRole('combobox', { name: 'Search services' })
// The search box has a status of its own, for its suggestion count.
const chatStatus = () =>
  within(askInput().closest<HTMLElement>('[data-for="ask"]')!).getByRole(
    'status',
  )

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

  it("suggests from api_v2's search documents once they load", async () => {
    const documents = [
      {
        url: '/travel/zebra-crossing-permit',
        title: 'Zebra crossing permit',
        description: null,
        digital: false,
        keywords: [],
        chunks: [],
      },
    ]
    render(
      <HomeHero
        questions={[QUESTION]}
        viewer="public"
        overlay={new Map()}
        loadDocuments={async () => documents}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    fireEvent.input(searchInput(), { target: { value: 'zebra' } })

    await waitFor(() =>
      expect(suggestMock).toHaveBeenLastCalledWith(
        'zebra',
        'public',
        expect.any(Map),
        documents,
      ),
    )
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
    expect(suggestMock).toHaveBeenLastCalledWith(
      'birth',
      'public',
      new Map(),
      undefined,
    )

    fireEvent.submit(searchInput())
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/search-results',
      search: { q: 'birth' },
    })
  })

  // Without :has(), both boxes are on screen whichever mode is checked.
  it('suggests for the search box while Ask is checked', () => {
    renderHero()

    fireEvent.input(searchInput(), { target: { value: 'birth' } })

    expect(suggestMock).toHaveBeenLastCalledWith(
      'birth',
      'public',
      new Map(),
      undefined,
    )
  })

  it('submits each box with its own text', () => {
    renderHero()
    fireEvent.input(searchInput(), { target: { value: 'birth' } })
    fireEvent.change(askInput(), { target: { value: 'Renew a passport' } })

    fireEvent.submit(searchInput())
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/search-results',
      search: { q: 'birth' },
    })

    fireEvent.submit(askInput())
    expect(assignedHref).toBe(`${new URL('/', CHAT_URL)}?q=Renew+a+passport`)
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
    // already there, so the status is on the page before the chat goes offline.
    const status = chatStatus()
    expect(status.textContent).toBe('')

    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' })
    await waitFor(() => expect(send.disabled).toBe(true))
    expect(screen.queryByRole('link', { name: QUESTION })).toBeNull()
    // Just the sentence, not the banner's link or the questions.
    expect(status.textContent).toBe('The assistant is not available right now.')

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

  it('keeps the newest chat check when an older one finishes later', async () => {
    let finishFirst: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finishFirst = resolve
            }),
        )
        .mockImplementation(async () => Response.json({ ok: true })),
    )
    renderHero()
    fireEvent(window, new Event('focus'))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: QUESTION })).toBeTruthy(),
    )

    await act(async () => {
      finishFirst(Response.json({ ok: false }))
    })

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled,
    ).toBe(false)
    expect(chatStatus().textContent).toBe('')
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

  it('tracks a popular search as a homepage search', () => {
    renderHero()
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    fireEvent.click(screen.getByRole('link', { name: 'Redirect my mail' }))

    expect(trackEventMock.mock.calls).toEqual([
      ['search-submit', { query: 'Redirect my mail', source: 'home' }],
    ])
  })

  it('hides a popular search whose service is hidden', () => {
    renderHero([QUESTION], new Map([['get-birth-certificate', 'preview']]))
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    expect(
      screen.queryByRole('link', { name: 'Birth certificates' }),
    ).toBeNull()
    expect(screen.getByRole('link', { name: 'Redirect my mail' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Financial assistance' }),
    ).toBeTruthy()
  })

  it('shows only the popular searches api_v2 serves, when it says', () => {
    // Public in the static registry, so this tests api_v2's answer wins.
    render(
      <HomeHero
        questions={[QUESTION]}
        viewer="public"
        overlay={new Map()}
        servedServices={['apply-financial-assistance']}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))

    expect(
      screen.queryByRole('link', { name: 'Birth certificates' }),
    ).toBeNull()
    expect(screen.queryByRole('link', { name: 'Redirect my mail' })).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Financial assistance' }),
    ).toBeTruthy()
  })
})

describe('HomeHero suggestion separators', () => {
  class ResizeObserverStub {
    static instances: Array<ResizeObserverStub> = []
    targets: Array<Element> = []
    disconnect = vi.fn()
    constructor(readonly callback: () => void) {
      ResizeObserverStub.instances.push(this)
    }
    observe(target: Element) {
      this.targets.push(target)
    }
  }

  // jsdom does no layout, so each item is put on a line by hand.
  const placeOnLine = (element: Element, line: number) => {
    element.getBoundingClientRect = () => new DOMRect(0, line * 24, 100, 24)
  }
  const label = () => screen.getByText('Try asking:')
  const row = () => label().parentElement!
  const observerOf = (element: Element) =>
    ResizeObserverStub.instances.find(({ targets }) =>
      targets.includes(element),
    )!
  const lineEnds = () => [...row().querySelectorAll('[data-line-end]')]

  beforeEach(() => {
    ResizeObserverStub.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  it('marks each item whose next item starts a new line', () => {
    renderHero(['First question', 'Second question'])
    const [first, second] = within(row()).getAllByRole('listitem')

    placeOnLine(label(), 0)
    placeOnLine(first, 0)
    placeOnLine(second, 1)
    observerOf(row()).callback()
    expect(lineEnds()).toEqual([first])

    placeOnLine(second, 0)
    observerOf(row()).callback()
    expect(lineEnds()).toEqual([])

    placeOnLine(first, 1)
    placeOnLine(second, 1)
    observerOf(row()).callback()
    expect(lineEnds()).toEqual([label()])
  })

  it('watches the new questions when they change', () => {
    const { rerender, unmount } = renderHero([
      'First question',
      'Second question',
    ])
    const before = observerOf(row())

    rerender(
      <HomeHero
        questions={['First question', 'Third question']}
        viewer="public"
        overlay={new Map()}
      />,
    )
    expect(before.disconnect).toHaveBeenCalled()
    const [first, third] = within(row()).getAllByRole('listitem')
    const after = observerOf(row())
    expect(observerOf(third)).toBe(after)

    placeOnLine(label(), 0)
    placeOnLine(first, 0)
    placeOnLine(third, 1)
    after.callback()
    expect(lineEnds()).toEqual([first])

    unmount()
    expect(after.disconnect).toHaveBeenCalled()
  })

  it('marks the line end when a replacement popular search wraps', () => {
    const hero = (secondService: string) => (
      <HomeHero
        questions={[]}
        viewer="public"
        overlay={new Map()}
        servedServices={['get-birth-certificate', secondService]}
      />
    )
    const { rerender } = render(hero('post-office-redirection-individual'))
    fireEvent.click(screen.getByRole('radio', { name: 'Search' }))
    rerender(hero('apply-financial-assistance'))

    const popularLabel = screen.getByText('Popular searches:')
    const popularRow = popularLabel.parentElement!
    const [first, added] = within(popularRow).getAllByRole('listitem')
    expect(added.textContent).toBe('Financial assistance')

    placeOnLine(popularLabel, 0)
    placeOnLine(first, 0)
    placeOnLine(added, 1)
    observerOf(popularRow).callback()
    expect(first.hasAttribute('data-line-end')).toBe(true)
  })
})

describe('HomeHero before hydration', () => {
  it('keeps a question typed before the page hydrated, and sends it', async () => {
    const hero = (
      <HomeHero questions={[QUESTION]} viewer="public" overlay={new Map()} />
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(hero)
    document.body.append(container)
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="Ask a question"]',
    )!
    input.value = 'How do I renew my passport?'

    const root = await act(async () => hydrateRoot(container, hero))
    // Let the chat check finish too, which renders the hero again.
    await waitFor(() =>
      expect(
        within(container).getByRole('button', { name: 'Send' }),
      ).toBeTruthy(),
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(input.value).toBe('How do I renew my passport?')
    fireEvent.submit(input)
    expect(assignedHref).toBe(
      `${new URL('/', CHAT_URL)}?q=How+do+I+renew+my+passport%3F`,
    )

    act(() => root.unmount())
    container.remove()
  })
})
