declare global {
  interface Window {
    umami?: {
      track: (name?: string, data?: Record<string, unknown>) => void
    }
  }
}

export function trackEvent(name: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!window.umami) return
  if (data === undefined) {
    window.umami.track(name)
  } else {
    window.umami.track(name, data)
  }
}

export function trackPageview(): void {
  if (typeof window === 'undefined') return
  window.umami?.track()
}

export function deriveStartEventName(href: string): string {
  // Trim leading/trailing slashes with index walks rather than a regex —
  // `/^\/+|\/+$/g` is a polynomial-ReDoS pattern (js/polynomial-redos) on
  // inputs with many repeated slashes.
  let start = 0
  let end = href.length
  while (start < end && href[start] === '/') start++
  while (end > start && href[end - 1] === '/') end--
  const trimmed = href.slice(start, end)
  const withoutStart = trimmed.replace(/\/start$/, '')
  const slug = withoutStart.replace(/\//g, '-')
  return `${slug}-start`
}
