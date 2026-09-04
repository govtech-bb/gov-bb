import { Heading, Link, StatusBanner, Text } from '@govtech-bb/react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { Root } from 'hast'
import type { Frontmatter } from '../../lib/frontmatter'
import { hideStartLinks } from '../../utils/markdown/plugins'
import { markdownComponents } from './MdComponents'
import { formatPublishDate } from '../../lib/format-date'
import { AvailableFormsContext } from './StartLink'

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

  return (
    <AvailableFormsContext.Provider value={availableForms}>
      <div className="govbb-prose">
        {toJsxRuntime(tree, {
          Fragment,
          jsx,
          jsxs,
          components: markdownComponents,
          ignoreInvalidStyle: true,
          passKeys: true,
          passNode: true,
        })}
      </div>
    </AvailableFormsContext.Provider>
  )
}

type MarkdownContentProps = {
  frontmatter: Frontmatter
  /** Compiled `.md` body. */
  hast?: Root
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
}

export function MarkdownContent({
  frontmatter,
  hast,
  availableForms,
  hideStartLink = false,
}: MarkdownContentProps) {
  return (
    <div className="mb-xm lg:grid lg:grid-cols-3 lg:gap-16">
      <div className="space-y-6 lg:col-span-2 lg:space-y-8">
        <div className="space-y-4 lg:space-y-6">
          <Heading as="h1" className="wrap-anywhere">
            {frontmatter.title}
          </Heading>

          {frontmatter.source_url ? (
            <StatusBanner variant="migrated" rounded>
              <p>
                This page was originally published on{' '}
                <Link href="https://www.gov.bb" external>
                  gov.bb
                </Link>
                . It may be out of date or shown differently here.
              </p>
              <p>
                <Link href={frontmatter.source_url} external>
                  View the original source
                </Link>
              </p>
            </StatusBanner>
          ) : null}

          {frontmatter.publish_date || frontmatter.lede ? (
            <div className="flex flex-col gap-xs">
              {frontmatter.publish_date ? (
                <div className="border-blue-10 border-b-4 pb-4 text-grey-70">
                  <Text as="p" size="body-sm">
                    Last updated on{' '}
                    {formatPublishDate(frontmatter.publish_date)}
                  </Text>
                </div>
              ) : null}

              {frontmatter.lede ? (
                <Text as="p" className="text-grey-70">
                  {frontmatter.lede}
                </Text>
              ) : null}
            </div>
          ) : null}
        </div>
        {hast ? (
          <MarkdownBody
            hast={hast}
            availableForms={availableForms}
            hideStartLink={hideStartLink}
          />
        ) : null}
      </div>
    </div>
  )
}
