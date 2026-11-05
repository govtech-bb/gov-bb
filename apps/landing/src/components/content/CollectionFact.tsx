import { useContext } from 'react'
import type { ReactNode } from 'react'
import { recordDetails } from '@govtech-bb/govbbmarkd/record-details'
import { MarkdownLink } from '../markdown/MarkdownLink'
import { PageRecordsContext } from './PageRecords'

/**
 * `:fact[fallback]{collection record field}` (#3590): one value from a
 * record, in a line of text. Phone numbers, emails and websites are links,
 * like the page's other links, except inside link text (`plain`). When the
 * record or field has gone it shows its fallback, or nothing.
 */
export function CollectionFact({
  collection,
  record,
  field,
  plain,
  children,
}: {
  collection?: string
  record?: string
  field?: string
  plain?: string
  children?: ReactNode
}) {
  const source = useContext(PageRecordsContext)[collection ?? '']
  const data = record ? source?.records[record] : undefined
  const [detail] =
    source && data && field
      ? recordDetails(source.collection, [field], data)
      : []

  if (!detail) return <>{children}</>
  if (!detail.href || plain === 'true') return <>{detail.text}</>

  return <MarkdownLink href={detail.href}>{detail.text}</MarkdownLink>
}
