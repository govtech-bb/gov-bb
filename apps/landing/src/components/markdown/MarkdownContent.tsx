import { Heading, Text } from '@govtech-bb/react'
import { format } from 'date-fns'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { Root } from 'hast'
import type { Frontmatter } from '../../lib/frontmatter'
import {
  hideStartLinks,
  sectionise,
  type MarkdownHeading,
} from '../../utils/markdown/plugins'
import { markdownComponents } from './MdComponents'
import { AvailableFormsContext, PageFormIdContext } from './StartLink'
import { TableOfContents } from './TableOfContents'
import { MigrationBanner } from '../MigrationBanner'

/**
 * Render precompiled hast to React. The expensive markdown parse already ran at
 * build time (see `vite-plugin-markdown.ts`); here we only walk the tree. The
 * two request-dependent passes stay at runtime, in the original plugin order:
 * `hideStartLinks` (gated on the page's preview state) then `sectionise`. Both
 * mutate, so we work on a clone of the shared, imported hast. The
 * `toJsxRuntime` options mirror `react-markdown@9` so output is identical.
 */
export function MarkdownBody({
  hast,
  formId,
  availableForms = new Set(),
  hideStartLink = false,
}: {
  hast: Root
  formId?: string
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
}) {
  const tree = structuredClone(hast)
  hideStartLinks({ hideStartLink })(tree)
  sectionise()(tree)

  return (
    <AvailableFormsContext.Provider value={availableForms}>
      <PageFormIdContext.Provider value={formId}>
        {toJsxRuntime(tree, {
          Fragment,
          jsx,
          jsxs,
          components: markdownComponents,
          ignoreInvalidStyle: true,
          passKeys: true,
          passNode: true,
        })}
      </PageFormIdContext.Provider>
    </AvailableFormsContext.Provider>
  )
}

export type MarkdownContentProps = {
  frontmatter: Frontmatter
  hast: Root
  headings?: Array<MarkdownHeading>
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
}

export function MarkdownContent({
  frontmatter,
  hast,
  headings = [],
  availableForms,
  hideStartLink = false,
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
        <MarkdownBody
          hast={hast}
          formId={frontmatter.form_id}
          availableForms={availableForms}
          hideStartLink={hideStartLink}
        />
      </div>
      <TableOfContents headings={headings} />
    </div>
  )
}
