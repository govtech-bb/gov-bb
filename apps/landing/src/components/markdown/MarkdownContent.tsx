import { Heading, Link, StatusBanner, Text } from '@govtech-bb/react'
import type { Root } from 'hast'
import type { Frontmatter } from '../../lib/frontmatter'
import { hideStartLinks } from '../../utils/markdown/plugins'
import { renderMarkdownNodes } from '@govtech-bb/govbbmarkd/react'
import { markdownComponents } from './MdComponents'
import { formatPublishDate } from '../../lib/format-date'
import { AvailableFormsContext } from './StartLink'
import { PageRecordsContext } from '../content/PageRecords'
import type { PageRecords } from '../../lib/api-v2-collections'

export function MarkdownBody({
  hast,
  availableForms = new Set(),
  hideStartLink = false,
  pageRecords = {},
  formId,
}: {
  hast: Root
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
  /** The records the page's contact blocks and facts name; none shows nothing. */
  pageRecords?: PageRecords
  formId?: string
}) {
  // Clone: these passes mutate, and hast is shared across renders.
  // toJsxRuntime options below match react-markdown@9.
  const tree = structuredClone(hast)
  hideStartLinks({ hideStartLink, linkedFormId: formId ?? null })(tree)

  return (
    <AvailableFormsContext.Provider value={availableForms}>
      <PageRecordsContext.Provider value={pageRecords}>
        <div className="govbb-prose">
          {renderMarkdownNodes(tree.children, markdownComponents)}
        </div>
      </PageRecordsContext.Provider>
    </AvailableFormsContext.Provider>
  )
}

type MarkdownContentProps = {
  frontmatter: Frontmatter
  /** Compiled `.md` body. */
  hast?: Root
  availableForms?: ReadonlySet<string>
  hideStartLink?: boolean
  pageRecords?: PageRecords
}

export function MarkdownContent({
  frontmatter,
  hast,
  availableForms,
  hideStartLink = false,
  pageRecords,
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
            pageRecords={pageRecords}
            formId={frontmatter.form_id}
          />
        ) : null}
      </div>
    </div>
  )
}
