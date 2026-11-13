import { trackEvent } from '@/lib/analytics'

/**
 * Sends tool-action `call` when someone uses a phone link (#3509). `target` is
 * an ID defined in code for who is called, never the phone number or a name.
 */
export function trackCall(step: 'find' | 'guidance', target: string): void {
  trackEvent('tool-action', {
    tool: 'shelter-finder',
    action: 'call',
    target,
    step,
  })
}
