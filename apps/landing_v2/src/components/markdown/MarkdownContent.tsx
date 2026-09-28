import { Heading, Link, StatusBanner, Text } from '@govtech-bb/react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { Root } from 'hast'
import type { Frontmatter } from '@govtech-bb/landing-v2-contract'
import { markdownComponents } from './MdComponents'
import { formatPublishDate } from '../../lib/format-date'

export function MarkdownBody({ hast }: { hast: Root }) {
  return (
    <div className="govbb-prose">
      {toJsxRuntime(hast, {
        Fragment,
        jsx,
        jsxs,
        components: markdownComponents,
        ignoreInvalidStyle: true,
        passKeys: true,
        passNode: true,
      })}
    </div>
  )
}

type MarkdownContentProps = {
  frontmatter: Frontmatter
  /** Compiled `.md` body. */
  hast?: Root
}

export function MarkdownContent({ frontmatter, hast }: MarkdownContentProps) {
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
                    {formatPublishDate(new Date(frontmatter.publish_date))}
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
        {hast ? <MarkdownBody hast={hast} /> : null}
      </div>
    </div>
  )
}
