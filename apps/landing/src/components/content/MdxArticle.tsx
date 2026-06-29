import type { ReactNode } from 'react'
import { Heading, Text } from '@govtech-bb/react'
import { format } from 'date-fns'
import type { Frontmatter } from '../../lib/frontmatter'
import { Muted } from './Muted'

/**
 * Single-column article chrome for `.mdx` content pages: the title, last-updated
 * rule and grey lede, then the page body. The body's top-level blocks become
 * direct flex children, so the `gap-m` rhythm applies between them.
 */
export function MdxArticle({
  frontmatter,
  children,
}: {
  frontmatter: Frontmatter
  children: ReactNode
}) {
  return (
    <div className="mb-l flex max-w-2xl flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{frontmatter.title}</Heading>
        {frontmatter.publish_date ? (
          <div className="border-blue-10 border-b-4 pb-4 text-mid-grey-00">
            <Text as="p" size="caption">
              Last updated on {format(frontmatter.publish_date, 'PPP')}
            </Text>
          </div>
        ) : null}
        {frontmatter.lede ? <Muted>{frontmatter.lede}</Muted> : null}
      </div>
      {children}
    </div>
  )
}
