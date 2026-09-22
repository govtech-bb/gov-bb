import { RenderDocument } from '@govtech-bb/block-kit'
import { useDocumentByUrl, useRenderData } from '@govtech-bb/spike-db/react'
import { Link, useLocation } from '@tanstack/react-router'

/**
 * One component serves every content page: the URL is the key into
 * `content_pages`, exactly as it will be when this reads over HTTP.
 */
export function SitePage({ url }: { url: string }) {
  const doc = useDocumentByUrl(url)
  const { data, loading } = useRenderData(doc)

  if (doc === undefined) return <p className="site-loading">Loading…</p>

  if (doc === null) {
    return (
      <div className="bk-document">
        <h1 className="bk-title">Page not found</h1>
        <p className="bk-paragraph">
          Nothing in <code>content_pages</code> has the url <code>{url}</code>.
        </p>
        <p className="bk-paragraph">
          <Link to="/">Back to the index</Link>
        </p>
      </div>
    )
  }

  // A finder page is one wide block; prose pages keep the reading measure.
  const wide = doc.body.blocks.some((block) => block.type === 'finder')

  return (
    <div className={wide ? 'bk-document bk-wide' : 'bk-document'}>
      <RenderDocument doc={doc} data={data} loading={loading} />
    </div>
  )
}

/** The splat route's component — resolves whatever path was requested. */
export function SitePageFromLocation() {
  const { pathname } = useLocation()
  return <SitePage url={pathname} />
}
