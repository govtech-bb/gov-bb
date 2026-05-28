import { useEffect, useState } from 'react'
import { Button, Heading, Input, Text } from '@govtech-bb/react'
import { trackEvent } from '../lib/analytics'

const CHAT_URL =
  import.meta.env.VITE_CHAT_URL || 'https://chat.sandbox.alpha.gov.bb'

const MAX_QUERY_LENGTH = 2000

const DEFAULT_QUESTIONS = [
  'How do I get a passport?',
  'How do I register a birth?',
  'What financial assistance is available?',
  "How do I apply for a driver's licence?",
]

type OnlineState = 'checking' | 'online' | 'offline'

const STATUS_STYLES: Record<OnlineState, { dot: string; label: string }> = {
  checking: { dot: 'bg-grey-00', label: 'Checking...' },
  online: { dot: 'bg-green-100', label: 'Online' },
  offline: { dot: 'bg-red-100', label: 'Offline' },
}

interface ChatAssistantProps {
  questions?: Array<string>
  source?: string
}

export function ChatAssistant({
  questions = DEFAULT_QUESTIONS,
  source = 'home',
}: ChatAssistantProps) {
  const chatUrl = CHAT_URL

  const [input, setInput] = useState('')
  const [status, setStatus] = useState<OnlineState>('checking')

  useEffect(() => {
    let probeId = 0
    let unmounted = false

    async function probe() {
      const myId = ++probeId
      try {
        const r = await fetch(`${chatUrl}/api/health/public`, {
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
  }, [chatUrl])

  const isOffline = status === 'offline'

  const goToChat = (query: string) => {
    if (isOffline) return
    const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH)
    if (!trimmed) return
    const url = new URL('/', chatUrl)
    url.searchParams.set('q', trimmed)
    window.location.href = url.toString()
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = input.trim().slice(0, MAX_QUERY_LENGTH)
    if (!trimmed || isOffline) return
    // Don't send the raw user query — it can contain PII. Track only that a
    // submit happened and where from.
    trackEvent('chat-submit', { source })
    goToChat(trimmed)
  }

  const { dot, label } = STATUS_STYLES[status]

  return (
    <div className="space-y-m">
      <div className="max-w-200 overflow-hidden rounded-lg border border-white-00 bg-white-00 shadow-md">
        <div className="flex items-center gap-xm bg-teal-00 p-xm text-white-00">
          <div className="flex-1 space-y-xxs">
            <Heading as="h2" size="h3">
              Ask your government assistant
            </Heading>
            <div className="flex items-center gap-xs text-grey-00">
              <div className="flex items-center gap-xs border-r border-grey-00 pr-xs">
                <span
                  aria-hidden="true"
                  className={`inline-block size-1.5 rounded-full ${dot}`}
                />
                <span className="text-base">{label}</span>
              </div>
              <span className="text-base">Powered by alpha.gov.bb</span>
            </div>
          </div>
        </div>

        <div className="px-s pt-xm pb-m">
          <div className="flex items-start gap-2.5">
            <div
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-00 text-sm font-bold text-white-00"
            >
              A
            </div>
            <div className="rounded-2xl rounded-bl-xs bg-blue-10 px-s py-3.5 text-black-00 max-w-130">
              <Text as="p" className="text-pretty">
                Welcome to <strong>alpha.gov.bb.</strong> What would you like help with today?
              </Text>
            </div>
          </div>
        </div>

        <div className="px-s pb-xm">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col items-center gap-xs"
          >
            <div className="flex w-full items-center gap-xs">
              <Input
                aria-label="Ask the government assistant"
                className="flex-1 text-black-00"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                maxLength={MAX_QUERY_LENGTH}
              />
              <Button type="submit" disabled={!input.trim() || isOffline}>
                Send
              </Button>
            </div>
            <Text size="caption" className="text-center text-mid-grey-00">
              Responses are based on official Government of Barbados information
            </Text>
          </form>
        </div>
      </div>

      <div className="max-w-250 space-y-s">
        <Heading as="h3" size="h4">
          Questions you can ask:
        </Heading>
        <div className="flex flex-wrap gap-s">
          {questions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={isOffline}
              onClick={() => {
                trackEvent('chat-suggestion', { question: q, source })
                goToChat(q)
              }}
              className="rounded-xl border border-grey-00 bg-blue-00 px-s py-xs text-sm text-white-00 hover:bg-blue-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-00"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
