import {
  Button,
  ButtonGroup,
  Input,
  Link,
  Select,
  StatusBanner,
  Text,
} from '@govtech-bb/react'
import { useRef, useState, useTransition } from 'react'
import { PARISHES } from '../-lib/parishes'
import { subscribeWaterAlerts } from '../-lib/water-alerts'

// A simple email shape check. Real validation happens when the confirmation
// email is sent — if it bounces, the address was wrong.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SubscribeForm({
  selectedArea,
  selectedLabel,
}: {
  selectedArea: string // "" means "All of Barbados"
  selectedLabel: string | null
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [area, setArea] = useState(selectedArea)
  const [emailError, setEmailError] = useState<string | undefined>()
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [doneMessage, setDoneMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const emailInput = useRef<HTMLInputElement>(null)
  const returnFocus = useRef(false)

  const headlinePlace = selectedLabel
    ? `in ${selectedLabel}`
    : 'anywhere in Barbados'

  function openForm() {
    setArea(selectedArea)
    setEmailError(undefined)
    setStatus('idle')
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const address = email.trim()
    if (!EMAIL_RE.test(address)) {
      setEmailError('Please enter a valid email address.')
      emailInput.current?.focus()
      return
    }
    setEmailError(undefined)
    startTransition(async () => {
      try {
        const result = await subscribeWaterAlerts({
          data: { email: address, area },
        })
        if (result.ok) {
          setDoneMessage(result.message)
          setStatus('done')
        } else {
          setStatus('error')
        }
      } catch {
        setStatus('error')
      }
    })
  }

  // Success: request taken, now they must confirm by email.
  if (status === 'done') {
    return (
      <div
        className="govbb-status-banner govbb-status-banner--rounded water-outages-result"
        data-tone="success"
        role="status"
      >
        <Text as="p">{doneMessage}</Text>
      </div>
    )
  }

  // Closed: the invitation card.
  if (!open) {
    return (
      <div className="govbb-status-banner govbb-status-banner--rounded water-outages-subscribe">
        <Text as="p">
          Get an email when the BWA publishes a water notice {headlinePlace}.
          You can unsubscribe at any time.
        </Text>
        <ButtonGroup>
          <Button
            onClick={openForm}
            ref={(button) => {
              if (button && returnFocus.current) {
                button.focus()
                returnFocus.current = false
              }
            }}
            type="button"
            variant="primary"
          >
            Get email alerts
          </Button>
        </ButtonGroup>
      </div>
    )
  }

  // Open: the form.
  return (
    <form
      aria-busy={isPending}
      aria-label="Get email alerts"
      className="govbb-status-banner govbb-status-banner--rounded water-outages-subscribe"
      onSubmit={handleSubmit}
    >
      <Text as="p" weight="bold">
        Get email alerts
      </Text>

      <Input
        autoComplete="email"
        autoFocus
        error={emailError}
        label="Your email address"
        maxLength={254}
        name="email"
        onChange={(e) => setEmail(e.target.value)}
        ref={emailInput}
        required
        type="email"
        value={email}
      />

      <Select
        label="Area for alerts"
        name="area"
        onChange={(e) => setArea(e.target.value)}
        value={area}
      >
        <option value="">All of Barbados</option>
        {PARISHES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>

      <Text as="p" className="govbb-hint" size="body-sm">
        We&apos;ll only use your email to send these alerts. You can unsubscribe
        at any time.{' '}
        <Link href="/terms-conditions#your-data">How we use your data</Link>.
      </Text>

      {status === 'error' && (
        <StatusBanner role="alert" variant="service">
          <Text as="p">
            We could not send your confirmation email. Please try again in a
            moment.
          </Text>
        </StatusBanner>
      )}

      <ButtonGroup>
        <Button disabled={isPending} type="submit" variant="primary">
          {isPending ? 'Sending…' : 'Get email alerts'}
        </Button>
        <Button
          disabled={isPending}
          onClick={() => {
            returnFocus.current = true
            setOpen(false)
          }}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </ButtonGroup>
    </form>
  )
}
