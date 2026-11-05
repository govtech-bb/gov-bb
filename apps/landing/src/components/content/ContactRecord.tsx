import { useContext } from 'react'
import { recordDetails } from '@govtech-bb/govbbmarkd/record-details'
import { PageRecordsContext } from './PageRecords'

/** A record's detail: a non-emergency contact tile. */
const CONTACT_TILE =
  'flex flex-col gap-xxs border-teal-80 border-l-4 bg-teal-10 p-s text-current'

/** A detail that is a link: tappable, so it shows hover and focus. */
const CONTACT_TILE_LINK = `${CONTACT_TILE} no-underline transition-colors hover:bg-teal-20 focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-40 focus-visible:outline-offset-2`

/**
 * `::contact{collection record fields}` (#3185): the record's chosen details
 * as contact tiles, labelled by the collection. Nothing at all when the
 * record is missing or couldn't be read — the page's own heading and wording
 * around the block still say how to get in touch.
 */
export function ContactRecord({
  collection,
  record,
  fields,
}: {
  collection?: string
  record?: string
  fields?: string
}) {
  const source = useContext(PageRecordsContext)[collection ?? '']
  const data = record ? source?.records[record] : undefined
  if (!source || !record || !data) return null

  const details = recordDetails(
    source.collection,
    (fields ?? '').split(',').map((field) => field.trim()),
    data,
  )
  if (details.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-s md:grid-cols-3">
      {details.map(({ field, label, text, href }) => {
        const content = (
          <>
            <span className="font-bold">{label}</span>
            <span className="font-bold text-teal-80 text-body">{text}</span>
          </>
        )
        return href ? (
          <a key={field} href={href} className={CONTACT_TILE_LINK}>
            {content}
          </a>
        ) : (
          <div key={field} className={CONTACT_TILE}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
