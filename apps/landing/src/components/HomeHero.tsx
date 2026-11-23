import { useEffect, useId, useRef, useState } from 'react'
import {
  Autocomplete,
  Button,
  Heading,
  Input,
  StatusBanner,
} from '@govtech-bb/react'
import { POPULAR_SEARCHES } from '../content/popular-searches'
import { isVisible, PAGES } from '../content/registry'
import type { ViewLevel } from '../lib/frontmatter'
import { trackEvent } from '../lib/analytics'
import { CHAT_URL } from '../lib/chat-url'
import type { ApiV2SearchDocument } from '../lib/api-v2-site'
import { HomeHeroSuggestions } from './HomeHeroSuggestions'
import { useServiceSearch } from './useServiceSearch'
import './HomeHero.css'

const MAX_QUESTION_LENGTH = 2000
const SOURCE = 'home'
const OFFLINE_MESSAGE = 'The assistant is not available right now.'

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

/** The header and banners can wrap after mount, changing how much of the first screen the hero fills. */
function observeChromeAboveHero(hero: HTMLElement | null) {
  if (!hero || typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(() => {
    const top = hero.getBoundingClientRect().top + window.scrollY
    hero.style.setProperty('--home-hero-chrome-height', `${top}px`)
  })
  for (const chrome of document.querySelectorAll(
    '.govbb-official-banner, .govbb-header, .govbb-status-banner',
  )) {
    observer.observe(chrome)
  }
  return () => observer.disconnect()
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
  /** Reads api_v2's search documents. */
  loadDocuments?: () => Promise<readonly ApiV2SearchDocument[]>
  /** The popular searches' services api_v2 serves, when it is configured.
   *  Unset, the static registry decides. */
  servedServices?: readonly string[]
}

export function HomeHero({
  questions,
  viewer,
  overlay,
  loadDocuments,
  servedServices,
}: HomeHeroProps) {
  const searchRadioRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const askInputRef = useRef<HTMLInputElement>(null)
  const modeName = useId()
  const searchInputId = useId()
  const askInputId = useId()

  // Null until Search is edited, including after a mode switch. Each form
  // submits its uncontrolled input, not this query.
  const [typedQuery, setTypedQuery] = useState<string | null>(null)
  const isChatOffline = useChatStatus() === 'offline'
  const search = useServiceSearch({
    source: SOURCE,
    viewer,
    overlay,
    text: typedQuery ?? '',
    setText: setTypedQuery,
    suggesting: typedQuery !== null,
    emptyTo: '/services',
    loadDocuments,
  })
  const popularSearches = POPULAR_SEARCHES.filter(({ serviceId }) => {
    if (servedServices) return servedServices.includes(serviceId)
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
    setTypedQuery(null)
  }

  const submitQuestion = () => {
    const question = (askInputRef.current?.value ?? '')
      .trim()
      .slice(0, MAX_QUESTION_LENGTH)
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
    switchMode('search')
    searchInputRef.current?.focus()
  }

  return (
    <section ref={observeChromeAboveHero} className="home-hero">
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
                  search.submit(searchInputRef.current?.value ?? '')
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
                      setTypedQuery(event.currentTarget.value)
                      search.refreshDocuments()
                    }}
                    onSuggestionSelect={search.onSuggestionSelect}
                  />
                  <Button type="submit">Search</Button>
                </div>
              </form>
              <HomeHeroSuggestions
                label="Popular searches:"
                items={popularSearches.map(({ query }) => query)}
                hrefFor={(q) => `/search-results?${new URLSearchParams({ q })}`}
                onFollow={(query) =>
                  trackEvent('search-submit', { query, source: SOURCE })
                }
              />
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
              ) : (
                <HomeHeroSuggestions
                  label="Try asking:"
                  items={questions}
                  hrefFor={chatHref}
                  onFollow={(question) =>
                    trackEvent('chat-suggestion', { question, source: SOURCE })
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
