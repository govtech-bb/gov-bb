import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLivePreview } from '@payloadcms/live-preview-react'
import type { SerializedEditorState } from 'lexical'
import {
  serviceDocToFrontmatter,
  organisationDocToFrontmatter,
  EMPTY_EDITOR_STATE,
  type ServiceDoc,
  type OrganisationDoc,
} from '@govtech-bb/content/map'
import { FrontmatterSchema, titleFromSlug } from '../lib/frontmatter'
import type { Frontmatter } from '../lib/frontmatter'
import { LexicalContent, LexicalBody } from '../components/LexicalContent'
import { MinistryPage } from '../components/MinistryPage'
import { PageShell } from '../components/PageShell'
import { PAGES } from '../content/registry'
import { ORG_PAGE_BY_SLUG, resolveOrgProps, orgEntryToProps } from '../content/orgs'
import type { Ministry } from '../content/mda'
import type { MdaEntry } from '../lib/mda-types'

const CMS_URL = import.meta.env.VITE_CMS_URL ?? 'http://localhost:8000'

type PreviewSearch = {
  collection: 'services' | 'organisations'
  slug: string
  id: string
}

export const Route = createFileRoute('/preview')({
  validateSearch: (search: Record<string, unknown>): PreviewSearch => ({
    collection: search.collection === 'organisations' ? 'organisations' : 'services',
    slug: search.slug != null ? String(search.slug) : '',
    // TanStack parses a numeric id (e.g. 88) as a number; coerce to string so it
    // isn't dropped during search validation.
    id: search.id != null ? String(search.id) : '',
  }),
  component: PreviewPage,
})

/** Build the resolved Frontmatter shape LexicalContent expects from mapper output. */
function toFrontmatter(data: Record<string, unknown>, slug: string): Frontmatter {
  const parsed = FrontmatterSchema.parse(data)
  const categories = Array.from(
    new Set([...(parsed.category ? [parsed.category] : []), ...(parsed.categories ?? [])]),
  )
  const { category: _c, categories: _cs, ...rest } = parsed
  return { ...rest, title: parsed.title ?? titleFromSlug(slug), categories }
}

function PreviewPage() {
  // The preview is a client-only tool (live data arrives via postMessage), so
  // skip SSR entirely to avoid hydration mismatches — render only after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { collection, slug, id } = Route.useSearch()
  // mergeData fetches `${collection}/${initialData.id}` to resolve the draft, so
  // the doc id must be present in initialData or live updates can't load.
  const { data } = useLivePreview<Record<string, unknown>>({
    initialData: id ? { id } : {},
    serverURL: CMS_URL,
    depth: 2,
  })
  // Live (draft) data arrives via postMessage inside the admin's Live Preview
  // panel and is merged onto initialData (which holds only the id). Until a
  // real document has merged in, fall back to the published content for this
  // slug — so a direct visit still renders, and live edits override it.
  const hasLive = Boolean(data && (data.body || data.title || data.name))

  // Server render (and the first client render) produce nothing, so they match;
  // real content renders once mounted on the client.
  if (!mounted) return null

  if (collection === 'organisations') {
    if (hasLive) {
      const { data: org } = organisationDocToFrontmatter(data as unknown as OrganisationDoc)
      const kind = (data.kind as OrganisationDoc['kind']) ?? 'department'
      const props = orgEntryToProps(kind, org as unknown as Ministry | MdaEntry)
      const body = (data.body as SerializedEditorState) ?? EMPTY_EDITOR_STATE
      return <MinistryPage {...props} body={<LexicalBody body={body} />} />
    }
    const found = ORG_PAGE_BY_SLUG.get(slug)
    if (!found) return <p className="p-8 text-mid-grey-00">No preview for “{slug}”.</p>
    const props = resolveOrgProps(found.kind, slug, {
      title: found.page?.frontmatter.title ?? slug,
      originalSource: found.page?.frontmatter.source_url,
    })
    const body = found.page?.body ?? EMPTY_EDITOR_STATE
    return <MinistryPage {...props} body={<LexicalBody body={body} />} />
  }

  const match = PAGES.find((p) => p.slug === slug)
  let frontmatter: Frontmatter
  let body: SerializedEditorState
  if (hasLive) {
    const mapped = serviceDocToFrontmatter(data as unknown as ServiceDoc)
    frontmatter = toFrontmatter(mapped.data, slug)
    body = mapped.body
  } else {
    if (!match) return <p className="p-8 text-mid-grey-00">No preview for “{slug}”.</p>
    frontmatter = match.frontmatter
    body = match.body
  }
  // Render through the same page chrome (breadcrumbs, container, helpful box) as
  // the real route; breadcrumbs follow the page's canonical URL, not /preview.
  return (
    <PageShell pathname={match ? `/${match.url}` : `/${slug}`}>
      <LexicalContent frontmatter={frontmatter} body={body} />
    </PageShell>
  )
}
