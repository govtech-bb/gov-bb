import {
  Button,
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

  const headlinePlace = selectedLabel
    ? `in ${selectedLabel}`
    : 'anywhere in Barbados'

  function openForm() {
    setArea(selectedArea)
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
        className="rounded-md border-2 border-green-40 bg-green-10 p-6"
        role="status"
      >
        <Text as="p">{doneMessage}</Text>
      </div>
    )
  }

  // Closed: the invitation card.
  if (!open) {
    return (
      <div className="rounded-md border-2 border-blue-40 bg-blue-10 p-6">
        <Text as="p" className="font-semibold">
          Get email alerts
        </Text>
        <Text as="p" className="mt-1">
          Get an email when the Barbados Water Authority publishes a water
          notice {headlinePlace}. We&apos;ll only use your email to send these
          alerts, and you can unsubscribe at any time.
        </Text>
        <Text as="p" className="mt-2" size="body-sm">
          <Link href="/terms-conditions#your-data">How we use your data</Link>
        </Text>
        <div className="mt-4">
          <Button onClick={openForm} type="button" variant="primary">
            Get email alerts
          </Button>
        </div>
      </div>
    )
  }

  // Open: the form.
  return (
    <form
      aria-busy={isPending}
      aria-label="Get email alerts"
      className="space-y-4 rounded-md border-2 border-blue-40 bg-blue-10 p-6"
      onSubmit={handleSubmit}
    >
      <Text as="p" className="font-semibold">
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

      <Text as="p" className="text-grey-70" size="body-sm">
        We&apos;ll only use your email to send these alerts. You can unsubscribe
        at any time.{' '}
        <Link href="/terms-conditions#your-data">How we use your data</Link>.
      </Text>

      {status === 'error' && (
        <StatusBanner role="alert" variant="service">
          <Text as="p">
            Something went wrong. Please try again in a moment.
          </Text>
        </StatusBanner>
      )}

      <div className="flex gap-3">
        <Button disabled={isPending} type="submit" variant="primary">
          {isPending ? 'Sending…' : 'Get email alerts'}
        </Button>
        <Button
          disabled={isPending}
          onClick={() => setOpen(false)}
          type="button"
          variant="tertiary"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
