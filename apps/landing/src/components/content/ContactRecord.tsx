import { createContext, useContext } from 'react'
import { contactBlockFor, contactDetails } from '@govtech-bb/block-kit/contact'
import type { ContactRecords } from '../../lib/api-v2-collections'
import { CONTACT_TILE, CONTACT_TILE_LINK, Contacts } from './Contacts'

/** The records this page's contact blocks name, read by the route's loader. */
export const ContactRecordsContext = createContext<ContactRecords>({})

/**
 * `::contact{collection record fields}` (#3185): the record's chosen details
 * as `<contacts>` tiles, labelled by the collection. Nothing at all when the
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
  const source = useContext(ContactRecordsContext)[collection ?? '']
  const data = record ? source?.records[record] : undefined
  if (!source || !record || !data) return null

  const block = contactBlockFor(
    source.collection,
    record,
    (fields ?? '').split(',').map((field) => field.trim()),
  )
  const details = contactDetails(block, data)
  if (details.length === 0) return null

  return (
    <Contacts>
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
    </Contacts>
  )
}
