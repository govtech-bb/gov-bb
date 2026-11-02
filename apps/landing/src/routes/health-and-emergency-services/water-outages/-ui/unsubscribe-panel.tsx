import { Button, ButtonGroup, Heading, Link, Text } from '@govtech-bb/react'
import { useState, useTransition } from 'react'
import { unsubscribeSubscription } from '../-lib/water-alerts'
import type { TokenOutcome } from '../-lib/water-alerts'
import { ResultNotice } from './result-notice'

export const MESSAGES: Record<
  TokenOutcome,
  { tone: 'success' | 'error'; title: string; body: string }
> = {
  done: {
    tone: 'success',
    title: 'You have been unsubscribed',
    body: 'You will no longer get water-outage alert emails. You can sign up again any time.',
  },
  already: {
    tone: 'success',
    title: 'Already unsubscribed',
    body: 'You were already unsubscribed — you will not get any more alert emails.',
  },
  invalid: {
    tone: 'error',
    title: 'This link is not valid',
    body: 'This unsubscribe link is invalid or has expired. If you keep getting emails, contact us.',
  },
  unavailable: {
    tone: 'error',
    title: 'We could not unsubscribe you',
    body: 'Your subscription has not been changed. Please try again in a few minutes.',
  },
}

// Unsubscribing waits for a click: mail scanners open every link in an email,
// and a page-load unsubscribe would silently stop the resident's alerts.
export function UnsubscribePanel({ token }: { token: string }) {
  const [outcome, setOutcome] = useState<TokenOutcome | null>(null)
  const [isPending, startTransition] = useTransition()

  if (outcome) {
    const m = MESSAGES[outcome] ?? MESSAGES.invalid
    return <ResultNotice body={m.body} title={m.title} tone={m.tone} />
  }

  return (
    <div className="water-outages-page">
      <div className="govbb-status-banner govbb-status-banner--rounded water-outages-result">
        <Heading as="h1">Unsubscribe from water alerts</Heading>
        <Text as="p">
          You will stop getting emails about water notices for this area.
        </Text>
        <ButtonGroup>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  setOutcome(await unsubscribeSubscription({ data: token }))
                } catch {
                  setOutcome('unavailable')
                }
              })
            }
            type="button"
            variant="primary"
          >
            {isPending ? 'Unsubscribing…' : 'Unsubscribe'}
          </Button>
        </ButtonGroup>
      </div>
      <Link href="/health-and-emergency-services/water-outages">
        Back to water outages
      </Link>
    </div>
  )
}
