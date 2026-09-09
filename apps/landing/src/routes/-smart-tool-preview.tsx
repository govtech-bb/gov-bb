import { useEffect, useState } from 'react'
import { z } from 'zod'
import { smartTool } from '@govtech-bb/content/smart-tools'
import {
  contentSchema,
  withContentFields,
} from '@govtech-bb/content/smart-tool-fields'
import type { ContentObject } from '@govtech-bb/content/smart-tool-fields'
import { PHARMACY_CONTENT } from './health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies'
import type { PharmacyContent } from './health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies'
import { FindOpenPharmacyPage } from './health-and-emergency-services/find-an-open-pharmacy/-ui/find-page'
import { PharmacyDetailPage } from './health-and-emergency-services/find-an-open-pharmacy/-ui/detail-page'
import { SHELTER_CONTENT } from './health-and-emergency-services/find-an-emergency-shelter/-data/emergency-shelters'
import type { ShelterContent } from './health-and-emergency-services/find-an-emergency-shelter/-data/emergency-shelters'
import { EmergencyShelterLandingPage } from './health-and-emergency-services/find-an-emergency-shelter/-ui/landing-page'
import { FindEmergencyShelterPage } from './health-and-emergency-services/find-an-emergency-shelter/-ui/find-page'
import { EmergencyShelterGuidancePage } from './health-and-emergency-services/find-an-emergency-shelter/-ui/guidance-page'

const messageSchema = z.object({
  source: z.literal('gov-bb-smart-tool-editor'),
  version: z.literal(1),
  id: z.string(),
  view: z.string(),
  content: z.record(z.string(), z.unknown()),
  recordId: z.string().optional(),
  feedState: z.enum(['notices', 'empty', 'unavailable']).optional(),
  outcome: z.enum(['done', 'already', 'invalid', 'unavailable']).optional(),
})
type PreviewMessage = z.infer<typeof messageSchema>

function allowedOrigin(origin: string) {
  const configured = import.meta.env.VITE_START_PAGE_EDITOR_ORIGIN
  if (configured) return origin === configured
  if (!import.meta.env.DEV) return false
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

export function SmartToolPreview() {
  const [message, setMessage] = useState<PreviewMessage | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || !allowedOrigin(event.origin)) return
      const parsed = messageSchema.safeParse(event.data)
      if (!parsed.success) {
        setError('Complete the fields in the editor to update this preview.')
        return
      }
      try {
        const definition = smartTool(parsed.data.id)
        if (!definition.views.some((view) => view.id === parsed.data.view))
          throw new Error('Choose a supported preview page.')
        const published = publishedContent(parsed.data.id)
        contentSchema(withContentFields(definition, published)).parse(
          parsed.data.content,
        )
        setMessage(parsed.data)
        setError('')
      } catch {
        setError(
          'The draft could not be previewed. Check its fields in the editor.',
        )
      }
    }
    window.addEventListener('message', receive)
    const editor = import.meta.env.VITE_START_PAGE_EDITOR_ORIGIN
    if (editor)
      window.parent.postMessage(
        { source: 'gov-bb-smart-tool-preview', version: 1 },
        editor,
      )
    else if (import.meta.env.DEV && document.referrer) {
      const origin = new URL(document.referrer).origin
      if (allowedOrigin(origin))
        window.parent.postMessage(
          { source: 'gov-bb-smart-tool-preview', version: 1 },
          origin,
        )
    }
    return () => window.removeEventListener('message', receive)
  }, [])
  return (
    <div
      onClickCapture={(event) => {
        if (
          !message ||
          !['pharmacies', 'shelters'].includes(message.id) ||
          !(event.target instanceof Element)
        )
          return
        const link = event.target.closest('a')
        if (
          !link ||
          link.target === '_blank' ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        const url = new URL(link.href, window.location.href)
        const root =
          message.id === 'pharmacies'
            ? '/health-and-emergency-services/find-an-open-pharmacy'
            : '/health-and-emergency-services/find-an-emergency-shelter'
        if (
          url.origin !== window.location.origin ||
          !(url.pathname === root || url.pathname.startsWith(`${root}/`))
        )
          return
        const leaf = url.pathname.slice(root.length).replace(/^\//, '')
        event.preventDefault()
        event.stopPropagation()
        setMessage({
          ...message,
          view:
            message.id === 'shelters'
              ? leaf === 'find' || leaf === 'guidance'
                ? leaf
                : 'page'
              : leaf === 'find'
                ? 'find'
                : 'detail',
          recordId: leaf,
        })
      }}
    >
      {error && <p role="alert">{error}</p>}
      {!message ? (
        <p>
          Waiting for the editor. Preview requires a configured editor origin on
          deployed sites.
        </p>
      ) : (
        <ToolRenderer message={message} />
      )}
    </div>
  )
}

export function publishedContent(id: string): ContentObject {
  const sources: Record<string, unknown> = {
    pharmacies: PHARMACY_CONTENT,
    shelters: SHELTER_CONTENT,
  }
  if (!sources[id]) throw new Error('This preview is not available.')
  return sources[id] as ContentObject
}

export function ToolRenderer({ message }: { message: PreviewMessage }) {
  if (message.id === 'pharmacies') {
    const content = message.content as unknown as PharmacyContent
    if (message.view === 'detail') {
      const pharmacy = content.pharmacies.find(
        (record) => record.slug === message.recordId,
      )
      return pharmacy ? (
        <PharmacyDetailPage pharmacy={pharmacy} content={content} />
      ) : (
        <p>Choose a pharmacy in the editor to preview its details.</p>
      )
    }
    return <FindOpenPharmacyPage content={content} />
  }
  if (message.id === 'shelters') {
    const content = message.content as unknown as ShelterContent
    if (message.view === 'find')
      return <FindEmergencyShelterPage content={content} />
    if (message.view === 'guidance')
      return <EmergencyShelterGuidancePage content={content} />
    return <EmergencyShelterLandingPage content={content} />
  }

  return <p>This smart tool preview is unavailable.</p>
}
