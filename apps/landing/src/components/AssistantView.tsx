import { useEffect, useRef, useState } from 'react'
import './assistant.css'

/**
 * Assistant hero + chat surface — the <main> content for the /assistant route.
 * The page chrome (OfficialBanner, StageBanner, Header, Footer) is provided by
 * __root, so this component renders only the conversation surface.
 *
 * `getBotReply` is a stand-in — swap it for the real assistant/chat API call.
 */

type Msg =
  | { role: 'user'; text: string }
  | { role: 'bot'; html: string }
  | { role: 'confirm'; title: string; body: string; ref: string }
  | { role: 'error'; text: string }

const STARTERS: { label: string; prompt: string }[] = [
  { label: 'Claim my pension', prompt: 'I want to claim my pension.' },
  { label: 'Register as self-employed', prompt: 'I want to register as self-employed.' },
  { label: "Renew my driver's licence", prompt: "I want to renew my driver's licence." },
  { label: 'Apply for a firearm licence', prompt: 'I want to apply for a firearm licence.' },
  { label: 'Get a permit to move a structure', prompt: 'I need a permit to move a structure on public roads.' },
  { label: 'Claim unemployment benefit', prompt: 'I want to claim unemployment benefit.' },
]

function getBotReply(_userText: string): Promise<Msg> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        role: 'bot',
        html:
          "Thanks — I can help with that. To get started I'll need a few details. " +
          'Which parish do you live in, and do you have your National Registration number to hand?',
      })
    }, 900)
  })
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [props.value])
  return <textarea ref={ref} {...props} />
}

const BotAvatar = () => (
  <span className="bot-avatar" aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4" />
      <path d="M9 4h6" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M9 14h.01" />
      <path d="M15 14h.01" />
    </svg>
  </span>
)

export function AssistantView() {
  const [view, setView] = useState<'hero' | 'chat'>('hero')
  const [messages, setMessages] = useState<Msg[]>([])
  const [heroValue, setHeroValue] = useState('')
  const [chatValue, setChatValue] = useState('')
  const [typing, setTyping] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesRef.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [messages, typing])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || typing) return
    setView('chat')
    setMessages((m) => [...m, { role: 'user', text: trimmed }])
    setHeroValue('')
    setChatValue('')
    setTyping(true)
    try {
      const reply = await getBotReply(trimmed)
      setMessages((m) => [...m, reply])
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'error', text: 'Sorry — something went wrong reaching the service. Please try again in a moment.' },
      ])
    } finally {
      setTyping(false)
    }
  }

  function restart() {
    setMessages([])
    setChatValue('')
    setTyping(false)
    setView('hero')
  }

  const onKeyDown = (value: string) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(value)
    }
  }

  return (
    <div className="gov-assistant">
      {view === 'hero' && (
        <section className="hero" aria-labelledby="assistant-greeting">
          <p className="hero-caption">Government of Barbados</p>
          <h1 id="assistant-greeting" className="hero-greeting">Hello. What do you need help with today?</h1>
          <p className="hero-lede">
            Renew a licence, register a business, apply for a benefit. Tell us what you need to do
            in your own words, and we'll walk you through it.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); send(heroValue) }} aria-label="Ask the assistant">
            <div className="compose">
              <label htmlFor="assistant-compose" className="sr-only">What do you need help with?</label>
              <AutoTextarea
                id="assistant-compose"
                className="compose-input"
                rows={1}
                placeholder="For example, I want to claim my pension…"
                value={heroValue}
                onChange={(e) => setHeroValue(e.target.value)}
                onKeyDown={onKeyDown(heroValue)}
                enterKeyHint="send"
                aria-describedby="assistant-hint"
              />
              <div className="compose-row">
                <span id="assistant-hint" className="compose-hint">Press Enter to send. Shift + Enter for a new line.</span>
                <button type="submit" className="send" aria-label="Send message" disabled={!heroValue.trim()}>
                  Send
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </form>

          <p className="chips-label">Or start with one of these</p>
          <div className="chips" role="group" aria-label="Quick-start tasks">
            {STARTERS.map((s) => (
              <button key={s.label} type="button" className="chip" onClick={() => send(s.prompt)}>
                {s.label}
              </button>
            ))}
          </div>

          <p className="browse-link-row">
            <span>Would rather see a list?</span>
            <a href="/services">Browse all services →</a>
          </p>
        </section>
      )}

      {view === 'chat' && (
        <section className="chat-area" aria-label="Conversation">
          <div className="chat-window">
            <div className="messages" ref={messagesRef} role="log" aria-live="polite" aria-atomic="false">
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return (
                    <div className="msg-user" key={i}>
                      <div className="bubble-user">{m.text}</div>
                    </div>
                  )
                }
                if (m.role === 'bot') {
                  return (
                    <div className="msg-bot" key={i}>
                      <div className="bot-header">
                        <BotAvatar />
                        <span className="bot-label">alpha.gov.bb</span>
                      </div>
                      <div className="bubble-bot" dangerouslySetInnerHTML={{ __html: m.html }} />
                    </div>
                  )
                }
                if (m.role === 'confirm') {
                  return (
                    <div className="msg-bot" key={i}>
                      <div className="confirm-panel">
                        <h2>{m.title}</h2>
                        <p>{m.body}</p>
                        <p className="ref-number">{m.ref}</p>
                      </div>
                    </div>
                  )
                }
                return (
                  <div className="msg-bot" key={i}>
                    <div className="bubble-error">{m.text}</div>
                  </div>
                )
              })}

              {typing && (
                <div className="typing-wrap">
                  <div className="typing-bubble" aria-label="Assistant is typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}
            </div>

            <div className="input-area">
              <form className="input-row" onSubmit={(e) => { e.preventDefault(); send(chatValue) }}>
                <label htmlFor="assistant-reply" className="sr-only">Type your reply</label>
                <AutoTextarea
                  id="assistant-reply"
                  className="chat-textarea"
                  rows={1}
                  placeholder="Type your reply…"
                  value={chatValue}
                  onChange={(e) => setChatValue(e.target.value)}
                  onKeyDown={onKeyDown(chatValue)}
                  enterKeyHint="send"
                  disabled={typing}
                />
                <button type="submit" className="send-btn" disabled={!chatValue.trim() || typing}>Send</button>
              </form>
            </div>
          </div>

          <div className="chat-footer">
            <a href="/services">Browse all services →</a>
            <button type="button" onClick={restart}>Start again</button>
          </div>
        </section>
      )}
    </div>
  )
}
