import { createContext, createRef, useContext } from 'react'
import type { RefObject, SyntheticEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { Breadcrumbs, SkipLink, StatusBanner } from '@govtech-bb/react'
import type { Root, RootContent } from 'hast'
import Header from '../components/Header'
import { SiteFooter } from '../components/SiteFooter'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/markdown/MarkdownContent'
import { FrontmatterSchema } from '../lib/frontmatter'
import type { Frontmatter } from '../lib/frontmatter'
import { shouldHideStartLink } from '../lib/hide-start-link'
import { processMarkdown } from '../utils/markdown/processor'
import { bakeStartLinkFormId } from '../utils/markdown/plugins/bakeStartLinkFormId'
import '../styles.css'

/** Display input only: the authenticated CMS owns source, undo and publication. */
export type CmsPreviewDocument = {
  frontmatter: Record<string, unknown>
  body: string
  path: string
  breadcrumbs: Array<{ label: string; href: string }>
  formStatus?: 'available' | 'unavailable' | 'maintenance' | 'closed'
  startSubPageVisible?: boolean
}

type PreparedPreview = {
  frontmatter: Frontmatter
  hast: Root
  availableForms: ReadonlySet<string>
  hideStartLink: boolean
  document: CmsPreviewDocument
}

// Unused API metadata need not pass static-content authoring rules.
const PreviewFrontmatterSchema = FrontmatterSchema.omit({
  stage: true,
  service_type: true,
  keywords: true,
})

// The public renderer accepts HTML. A preview runs beside CMS credentials, so it
// must refuse executable/embedded markup even if a caller bypasses the writer's gate.
function assertPreviewMarkup(nodes: RootContent[]) {
  for (const node of nodes) {
    if (node.type !== 'element') continue
    if (
      [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'link',
        'meta',
        'base',
        'form',
        'input',
        'button',
        'textarea',
        'select',
        'svg',
        'math',
      ].includes(node.tagName) ||
      Object.keys(node.properties).some(
        (key) =>
          /^on/i.test(key) || ['style', 'srcDoc', 'srcSet'].includes(key),
      )
    )
      throw new Error(
        'Site preview cannot display executable or embedded HTML.',
      )
    assertPreviewMarkup(node.children)
  }
}

/** Compile through the ordinary public pipeline without changing the author's source. */
export async function prepareCmsPreview(
  document: CmsPreviewDocument,
): Promise<PreparedPreview> {
  const metadata = PreviewFrontmatterSchema.parse({
    ...document.frontmatter,
    source_url:
      document.frontmatter.source_url === ''
        ? undefined
        : document.frontmatter.source_url,
  })
  if (metadata.source_url && !/^https?:\/\//i.test(metadata.source_url))
    throw new Error('Site preview source URL must use HTTP or HTTPS.')
  const frontmatter: Frontmatter = {
    ...metadata,
    title: metadata.title || 'Untitled page',
    categories:
      metadata.categories ?? (metadata.category ? [metadata.category] : []),
  }
  const { hast } = await processMarkdown(document.body)
  assertPreviewMarkup(hast.children)
  bakeStartLinkFormId(hast, frontmatter.form_id)
  const availableForms = new Set(
    document.formStatus === 'available' && frontmatter.form_id
      ? [frontmatter.form_id]
      : [],
  )
  return {
    document,
    frontmatter,
    hast,
    availableForms,
    hideStartLink: shouldHideStartLink({
      startSubPageVisible: document.startSubPageVisible ?? true,
      formId: frontmatter.form_id,
      availableForms: [...availableForms],
    }),
  }
}

type PreviewRegions = {
  title: RefObject<HTMLSpanElement | null>
  lede: RefObject<HTMLSpanElement | null>
  body: RefObject<HTMLDivElement | null>
}
const PreviewContext = createContext<{
  page: PreparedPreview
  assetBase: string
  editing: boolean
  regions: PreviewRegions
} | null>(null)

function blockPreviewAction(event: SyntheticEvent) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('a, form')) return
  event.preventDefault()
  event.stopPropagation()
  const href = target.closest('a')?.getAttribute('href')
  if (event.type === 'click' && href?.startsWith('#')) {
    const destination = document.getElementById(href.slice(1))
    if (destination && event.currentTarget.contains(destination)) {
      destination.scrollIntoView()
      destination.focus({ preventScroll: true })
    }
  }
}

function CmsPreviewPage() {
  const value = useContext(PreviewContext)!
  const { page, assetBase, editing, regions } = value
  return (
    <div
      data-cms-site-preview=""
      onClickCapture={blockPreviewAction}
      onAuxClickCapture={blockPreviewAction}
      onSubmitCapture={blockPreviewAction}
    >
      <SkipLink href="#cms-site-content" />
      <div className="print:hidden">
        <Header assetBase={assetBase} />
      </div>
      <div className="govbb-width-container pt-4 print:hidden lg:pt-6">
        <Breadcrumbs items={page.document.breadcrumbs} collapseOnMobile />
      </div>
      <main id="cms-site-content" tabIndex={-1}>
        <div className="govbb-width-container govbb-main-wrapper">
          {page.document.formStatus === 'maintenance' && (
            <StatusBanner variant="service" className="mb-s" rounded>
              <p>
                This form is currently being upgraded to serve you better.
                Please check back soon.
              </p>
            </StatusBanner>
          )}
          {page.document.formStatus === 'closed' && (
            <StatusBanner variant="service" className="mb-s" rounded>
              <p>Applications for this service have closed.</p>
            </StatusBanner>
          )}
          <div data-cms-preview-article="">
            <MarkdownContent
              frontmatter={page.frontmatter}
              hast={page.hast}
              availableForms={page.availableForms}
              hideStartLink={page.hideStartLink}
              editableRegions={
                editing
                  ? {
                      title: (
                        <span data-cms-region="title" ref={regions.title} />
                      ),
                      lede: <span data-cms-region="lede" ref={regions.lede} />,
                      body: <div data-cms-region="body" ref={regions.body} />,
                    }
                  : undefined
              }
            />
          </div>
        </div>
        <div className="govbb-width-container print:hidden">
          <HelpfulBox className="mb-4 lg:mb-16" />
        </div>
      </main>
      <SiteFooter assetBase={assetBase} />
    </div>
  )
}

/** Same-document browser entry; no iframe, credentials, API writes or editor imports. */
export async function mountCmsPreview(
  container: HTMLElement,
  initial: CmsPreviewDocument,
  assetBase: string,
) {
  const rootRoute = createRootRoute()
  const content = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: CmsPreviewPage,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([content]),
    history: createMemoryHistory({ initialEntries: [initial.path] }),
  })
  const root = createRoot(container, { identifierPrefix: 'cms-preview-' })
  let revision = 0
  let disposed = false
  let page: PreparedPreview
  let editing = false
  const regions: PreviewRegions = {
    title: createRef(),
    lede: createRef(),
    body: createRef(),
  }
  const render = () =>
    flushSync(() =>
      root.render(
        <PreviewContext value={{ page, assetBase, editing, regions }}>
          <RouterProvider router={router} />
        </PreviewContext>,
      ),
    )
  const update = async (document: CmsPreviewDocument) => {
    const requested = ++revision
    const prepared = await prepareCmsPreview(document)
    if (disposed || revision !== requested) return
    if (router.state.location.pathname !== document.path)
      await router.navigate({
        to: document.path,
        replace: true,
        resetScroll: false,
      })
    if (!page) await router.load()
    if (disposed || revision !== requested) return
    page = prepared
    render()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    root.unmount()
  }
  try {
    await update(initial)
  } catch (error) {
    dispose()
    throw error
  }
  return {
    update,
    dispose,
    setEditing(value: boolean) {
      if (disposed) throw new Error('Site preview has been disposed.')
      editing = value
      render()
      return value
        ? {
            title: regions.title.current!,
            lede: regions.lede.current!,
            body: regions.body.current!,
          }
        : null
    },
  }
}
