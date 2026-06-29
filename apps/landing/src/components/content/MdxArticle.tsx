import type { ReactNode } from 'react'
import { Heading, Text } from '@govtech-bb/react'
import type { Frontmatter } from '../../lib/frontmatter'
import { formatPublishDate } from '../../lib/format-date'
import { MigrationBanner } from '../MigrationBanner'
import { Muted } from './Muted'

/**
 * The one chrome for `.mdx` content pages: title, optional migration banner,
 * last-updated rule and grey lede, then the page body in the two-thirds grid
 * column shared by every content page. (Mirrors the layout the legacy
 * MarkdownContent gave `.md` pages, so the two are interchangeable through the
 * `.md` → `.mdx` migration.)
 */
export function MdxArticle({
  frontmatter,
  children,
}: {
  frontmatter: Frontmatter
  children: ReactNode
}) {
  return (
    <div className="mb-xm lg:grid lg:grid-cols-3 lg:gap-16">
      <div className="space-y-6 lg:col-span-2 lg:space-y-8">
        <div className="space-y-4 lg:space-y-6">
          <Heading as="h1" className="break-anywhere">
            {frontmatter.title}
          </Heading>
          {frontmatter.source_url ? (
            <MigrationBanner pageURL={frontmatter.source_url} />
          ) : null}
          {frontmatter.publish_date ? (
            <div className="border-blue-10 border-b-4 pb-4 text-mid-grey-00">
              <Text as="p" size="caption">
                Last updated on {formatPublishDate(frontmatter.publish_date)}
              </Text>
            </div>
          ) : null}
          {frontmatter.lede ? <Muted>{frontmatter.lede}</Muted> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
