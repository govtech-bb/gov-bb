import { Heading, Text } from '@govtech-bb/react'
import { format } from 'date-fns'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { ReactNode } from 'react'
import type { Root } from 'hast'
import type { Frontmatter } from '../../lib/frontmatter'
import { hideStartLinks, sectionise } from '../../utils/markdown/plugins'
import { markdownComponents } from './MdComponents'
import { AvailableFormsContext } from './StartLink'
import { MigrationBanner } from '../MigrationBanner'

export function MarkdownBody({
  hast,
  availableForms = new Set(),
  hideStartLink = false,
}: {
  hast: Root
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
}) {
  // Clone: these passes mutate, and hast is shared across renders.
  // toJsxRuntime options below match react-markdown@9.
  const tree = structuredClone(hast)
  hideStartLinks({ hideStartLink })(tree)
  sectionise()(tree)

  return (
    <AvailableFormsContext.Provider value={availableForms}>
      {toJsxRuntime(tree, {
        Fragment,
        jsx,
        jsxs,
        components: markdownComponents,
        ignoreInvalidStyle: true,
        passKeys: true,
        passNode: true,
      })}
    </AvailableFormsContext.Provider>
  )
}

type MarkdownContentProps = {
  frontmatter: Frontmatter
  /** Compiled `.md` body. Omit when passing a pre-rendered `children` body. */
  hast?: Root
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
  /** Pre-rendered body (an MDX component), rendered instead of `hast`. */
  children?: ReactNode
}

export function MarkdownContent({
  frontmatter,
  hast,
  availableForms,
  hideStartLink = false,
  children,
}: MarkdownContentProps) {
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
                Last updated on {format(frontmatter.publish_date, 'PPP')}
              </Text>
            </div>
          ) : null}
        </div>
        {children ??
          (hast ? (
            <MarkdownBody
              hast={hast}
              availableForms={availableForms}
              hideStartLink={hideStartLink}
            />
          ) : null)}
      </div>
    </div>
  )
}
