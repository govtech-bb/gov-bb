import { useEffect, useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { flushSync } from 'react-dom'
import {
  Autocomplete,
  Button,
  Heading,
  Input,
  StatusBanner,
} from '@govtech-bb/react'
import { isVisible, PAGES } from '../content/registry'
import type { ViewLevel } from '../lib/frontmatter'
import { trackEvent } from '../lib/analytics'
import { CHAT_URL } from '../lib/chat-url'
import { useServiceSearch } from './useServiceSearch'
import './HomeHero.css'

const MAX_QUESTION_LENGTH = 2000
const SOURCE = 'home'
const OFFLINE_MESSAGE = 'The assistant is not available right now.'

// Each search leads to one service, so it's hidden while that service is.
const POPULAR_SEARCHES = [
  { query: 'Birth certificates', serviceId: 'get-birth-certificate' },
  {
    query: 'Redirect my mail',
    serviceId: 'post-office-redirection-individual',
  },
  { query: 'Financial assistance', serviceId: 'apply-financial-assistance' },
]

type Mode = 'search' | 'ask'
type ChatStatus = 'checking' | 'online' | 'offline'

function chatHref(question: string) {
  const url = new URL('/', CHAT_URL)
  url.searchParams.set('q', question)
  return url.toString()
}

/** Re-checks when the tab comes back, so a recovered chat re-enables Send. */
function useChatStatus(): ChatStatus {
  const [status, setStatus] = useState<ChatStatus>('checking')

  useEffect(() => {
    let probeId = 0
    let unmounted = false

    async function probe() {
      const myId = ++probeId
      try {
        const r = await fetch(`${CHAT_URL}/api/health/public`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        })
        if (unmounted || myId !== probeId) return
        const data = r.ok ? ((await r.json()) as { ok?: boolean }) : null
        if (unmounted || myId !== probeId) return
        setStatus(data?.ok === true ? 'online' : 'offline')
      } catch {
        if (!unmounted && myId === probeId) setStatus('offline')
      }
    }

    void probe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void probe()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      unmounted = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  return status
}

/** Lets the hero fill the first screen below the banners and header, whose height varies with width and wrapping. */
function useHeightOfChromeAbove(hero: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = hero.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.setProperty('--home-hero-chrome-height', `${top}px`)
    })
    for (const chrome of document.querySelectorAll(
      '.govbb-official-banner, .govbb-header, .govbb-status-banner',
    )) {
      observer.observe(chrome)
    }
    return () => observer.disconnect()
  }, [hero])
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M9.16667 15C12.3883 15 15 12.3883 15 9.16667C15 5.94501 12.3883 3.33333 9.16667 3.33333C5.94501 3.33333 3.33333 5.94501 3.33333 9.16667C3.33333 12.3883 5.94501 15 9.16667 15Z"
        stroke="currentColor"
        strokeWidth="1.66667"
      />
      <path
        d="M16.6667 16.6667L13.3333 13.3333"
        stroke="currentColor"
        strokeWidth="1.66667"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M10 2.5C10.4167 6.25 13.3333 9.16667 17.0833 9.58333V10.4167C13.3333 10.8333 10.4167 13.75 10 17.5H9.16667C8.75 13.75 5.83333 10.8333 2.08333 10.4167V9.58333C5.83333 9.16667 8.75 6.25 9.16667 2.5H10Z"
        fill="currentColor"
      />
    </svg>
  )
}

interface HomeHeroProps {
  questions: Array<string>
  viewer: ViewLevel
  overlay: ReadonlyMap<string, ViewLevel>
}

export function HomeHero({ questions, viewer, overlay }: HomeHeroProps) {
  const heroRef = useRef<HTMLElement>(null)
  const searchRadioRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const askInputRef = useRef<HTMLInputElement>(null)
  const modeName = useId()
  const searchInputId = useId()
  const askInputId = useId()

  const [mode, setMode] = useState<Mode>('ask')
  // The active input's text, for suggestions and submitting. The inputs
  // themselves are uncontrolled, so text typed before hydration isn't wiped.
  const [text, setText] = useState('')
  // Only typed text gets suggestions, not text carried over from Ask.
  const [hasTyped, setHasTyped] = useState(false)
  const chatStatus = useChatStatus()
  useHeightOfChromeAbove(heroRef)

  // The radios and inputs are uncontrolled so a choice or text entered before
  // hydration, or restored by the browser on Back, isn't overwritten; this
  // picks it up.
  useEffect(() => {
    const searching = searchRadioRef.current?.checked === true
    if (searching) setMode('search')
    setText((searching ? searchInputRef : askInputRef).current?.value ?? '')
  }, [])

  const isChatOffline = chatStatus === 'offline'
  const search = useServiceSearch({
    source: SOURCE,
    viewer,
    overlay,
    text,
    setText,
    suggesting: mode === 'search' && hasTyped,
    emptyTo: '/services',
  })
  const popularSearches = POPULAR_SEARCHES.filter(({ serviceId }) => {
    const page = PAGES.find(({ slug }) => slug === serviceId)
    return page ? isVisible(page, 'public', overlay) : false
  })

  // Carries the text across, so it's still there after switching.
  const switchMode = (next: Mode) => {
    const [from, to] =
      next === 'ask'
        ? [searchInputRef.current, askInputRef.current]
        : [askInputRef.current, searchInputRef.current]
    let value = from?.value ?? ''
    if (next === 'ask') value = value.slice(0, MAX_QUESTION_LENGTH)
    if (to) to.value = value
    setMode(next)
    setHasTyped(false)
    setText(value)
  }

  const submitQuestion = () => {
    const question = text.trim().slice(0, MAX_QUESTION_LENGTH)
    if (!question) {
      askInputRef.current?.focus()
      return
    }
    if (isChatOffline) return
    // Not the question itself: it can contain personal details.
    trackEvent('chat-submit', { source: SOURCE })
    window.location.href = chatHref(question)
  }

  const searchInstead = () => {
    if (searchRadioRef.current) searchRadioRef.current.checked = true
    // Flushed so the search box is visible before it takes focus.
    flushSync(() => switchMode('search'))
    searchInputRef.current?.focus()
  }

  return (
    <section ref={heroRef} className="home-hero">
      <div className="home-hero__backdrop">
        <img
          className="home-hero__image"
          src="/images/home-hero.jpg"
          srcSet="/images/home-hero-small.jpg 1200w, /images/home-hero.jpg 2400w"
          sizes="(orientation: portrait) and (50rem <= width <= 64rem) 100vw, (width >= 64rem) 142vw, (width >= 50rem) 100vw, 346vw"
          alt=""
          fetchPriority="high"
        />
      </div>
      <div className="govbb-width-container home-hero__inner">
        <Heading as="h1" className="home-hero__title">
          Find and use Barbados government services
        </Heading>

        <div className="home-hero__panel">
          <fieldset className="home-hero__toggle">
            <legend className="govbb-visually-hidden">
              Choose how to find what you need
            </legend>
            <label className="home-hero__toggle-option">
              <input
                ref={searchRadioRef}
                type="radio"
                name={modeName}
                value="search"
                onChange={() => switchMode('search')}
              />
              <SearchIcon />
              Search
            </label>
            <label className="home-hero__toggle-option">
              <input
                type="radio"
                name={modeName}
                value="ask"
                defaultChecked
                onChange={() => switchMode('ask')}
              />
              <SparkleIcon />
              Ask Assistant
            </label>
          </fieldset>

          <div className="home-hero__modes">
            <div className="home-hero__mode" data-for="search">
              <form
                role="search"
                className="home-hero__form"
                action="/search-results"
                method="get"
                onSubmit={(event) => {
                  event.preventDefault()
                  search.submit(text)
                }}
              >
                <div className="home-hero__field">
                  <label
                    className="govbb-visually-hidden"
                    htmlFor={searchInputId}
                  >
                    Search services
                  </label>
                  <Autocomplete
                    ref={searchInputRef}
                    id={searchInputId}
                    name="q"
                    className="home-hero__input"
                    placeholder="Search services"
                    autoComplete="off"
                    enterKeyHint="search"
                    suggestions={search.hits.map((hit) => ({
                      value: hit.title,
                    }))}
                    onChange={(event) => {
                      setHasTyped(true)
                      setText(event.currentTarget.value)
                    }}
                    onSuggestionSelect={search.onSuggestionSelect}
                  />
                  <Button type="submit">Search</Button>
                </div>
              </form>
              {popularSearches.length > 0 ? (
                <div className="home-hero__suggestions">
                  <p className="home-hero__suggestions-label">
                    Popular searches:
                  </p>
                  <ul className="home-hero__suggestions-list" role="list">
                    {popularSearches.map(({ query }) => (
                      <li key={query}>
                        <a
                          className="govbb-link"
                          href={`/search-results?${new URLSearchParams({ q: query })}`}
                        >
                          {query}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="home-hero__mode" data-for="ask">
              <form
                className="home-hero__form"
                action={new URL('/', CHAT_URL).toString()}
                method="get"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitQuestion()
                }}
              >
                <div className="home-hero__field">
                  <label className="govbb-visually-hidden" htmlFor={askInputId}>
                    Ask a question
                  </label>
                  <Input
                    ref={askInputRef}
                    id={askInputId}
                    name="q"
                    type="text"
                    className="home-hero__input"
                    placeholder="Ask a question"
                    autoComplete="off"
                    enterKeyHint="send"
                    maxLength={MAX_QUESTION_LENGTH}
                    onChange={(event) => setText(event.currentTarget.value)}
                  />
                  <Button type="submit" disabled={isChatOffline}>
                    Send
                  </Button>
                </div>
              </form>
              {/* Always present, so screen readers announce the sentence when
                  the chat goes offline. Only the sentence: the banner and the
                  questions would be read out in full. */}
              <p role="status" className="govbb-visually-hidden">
                {isChatOffline ? OFFLINE_MESSAGE : null}
              </p>
              {isChatOffline ? (
                <StatusBanner
                  variant="service"
                  rounded
                  className="home-hero__status"
                >
                  <p>
                    <strong>{OFFLINE_MESSAGE}</strong> You can still{' '}
                    <button
                      type="button"
                      className="govbb-link home-hero__link-button"
                      onClick={searchInstead}
                    >
                      search for a service
                    </button>
                    .
                  </p>
                </StatusBanner>
              ) : questions.length > 0 ? (
                <div className="home-hero__suggestions">
                  <p className="home-hero__suggestions-label">Try asking:</p>
                  <ul className="home-hero__suggestions-list" role="list">
                    {questions.map((question) => (
                      <li key={question}>
                        <a
                          className="govbb-link"
                          href={chatHref(question)}
                          onClick={() =>
                            trackEvent('chat-suggestion', {
                              question,
                              source: SOURCE,
                            })
                          }
                        >
                          {question}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
