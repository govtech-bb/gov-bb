import { trackEvent } from './analytics'

/**
 * Counts Tell us submissions (#3516). The Tally form on /tell-us lives in an
 * iframe, so its submit never reaches our analytics. Tally posts a JSON string
 * to this window instead; we count `Tally.FormSubmitted` from tally.so only.
 * The payload holds every answer, so none of it is sent (ADR 0004).
 */
const TALLY_ORIGIN = 'https://tally.so'

export function installTallySubmitListener(): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== TALLY_ORIGIN) return
    if (typeof event.data !== 'string') return
    let message: unknown
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (
      (message as { event?: unknown } | null)?.event !== 'Tally.FormSubmitted'
    )
      return
    trackEvent('tell-us-submit')
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
