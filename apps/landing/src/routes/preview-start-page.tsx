import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { Root } from 'hast'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/markdown'
import { processMarkdown } from '../utils/markdown/processor'
import { bakeStartLinkFormId } from '../utils/markdown/plugins'
import type { Frontmatter, ViewLevel } from '../lib/frontmatter'

/**
 * Live-preview surface for the form_builder Start pages editor.
 *
 * The editor (a separate app) embeds this route in an iframe and posts the
 * page's frontmatter + markdown body via `postMessage` on every keystroke. We
 * compile the markdown at runtime with the *same* remark/rehype pipeline the
 * build uses and render it through the real content-page components — so the
 * author sees exactly how the page will look on the live site, including the
 * green "Start now" button (forced visible here regardless of the forms
 * manifest, since the linked form may not be deployed yet).
 *
 * Not linked from anywhere and `noindex`: it only renders content handed to it
 * over postMessage.
 */
export const Route = createFileRoute('/preview-start-page')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: PreviewStartPage,
})

const EDITOR_SOURCE = 'gov-bb-start-page-editor'
const PREVIEW_SOURCE = 'gov-bb-start-page-preview'

const ALLOWED_ORIGIN = import.meta.env.VITE_START_PAGE_EDITOR_ORIGIN as
  | string
  | undefined

function isAllowedOrigin(origin: string): boolean {
  if (import.meta.env.DEV) return true
  return !ALLOWED_ORIGIN || origin === ALLOWED_ORIGIN
}

interface EditorMessage {
  source: string
  frontmatter?: {
    title?: string
    description?: string
    category?: string
    stage?: 'alpha'
    visibility?: ViewLevel
    form_id?: string
    publish_date?: string
  }
  body?: string
  /** The page's would-be URL path, for the breadcrumb trail. */
  path?: string
}

function toFrontmatter(fm: EditorMessage['frontmatter']): Frontmatter {
  return {
    title: fm?.title?.trim() || 'Untitled service',
    description: fm?.description,
    categories: fm?.category ? [fm.category] : [],
    publish_date: fm?.publish_date ? new Date(fm.publish_date) : undefined,
    stage: fm?.stage,
    visibility: fm?.visibility ?? 'public',
    form_id: fm?.form_id,
  }
}

function PreviewStartPage() {
  const [state, setState] = useState<{
    frontmatter: Frontmatter
    body: string
    path: string
  } | null>(null)
  const [hast, setHast] = useState<Root | null>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isAllowedOrigin(event.origin)) return
      const data = event.data as EditorMessage | undefined
      if (!data || data.source !== EDITOR_SOURCE) return
      setState({
        frontmatter: toFrontmatter(data.frontmatter),
        body: data.body ?? '',
        path: data.path ?? '',
      })
    }
    window.addEventListener('message', onMessage)
    // Handshake: the editor may have mounted (and sent its first state) before
    // this listener attached, so announce readiness and let it (re)send.
    window.parent?.postMessage({ source: PREVIEW_SOURCE, type: 'ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!state) {
      setHast(null)
      return
    }
    let cancelled = false
    void processMarkdown(state.body).then(({ hast: tree }) => {
      if (cancelled) return
      bakeStartLinkFormId(tree, state.frontmatter.form_id)
      setHast(tree)
    })
    return () => {
      cancelled = true
    }
  }, [state])

  const formId = state?.frontmatter.form_id

  // PageShell's markup, but with the breadcrumb trail rendered for the
  // *previewed* page's URL rather than this route's own /preview-start-page.
  return (
    <>
      <div className="container py-4 lg:py-6">
        <Breadcrumbs pathname={state?.path || '/'} />
      </div>
      <div className="container pt-4 pb-8 lg:py-8">
        {state && hast ? (
          <MarkdownContent
            frontmatter={state.frontmatter}
            hast={hast}
            availableForms={formId ? new Set([formId]) : new Set()}
          />
        ) : (
          <p className="text-mid-grey-00">
            Start typing in the editor to see a live preview…
          </p>
        )}
      </div>
      <div className="container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
