import { createServerFn } from '@tanstack/react-start'
import type { Root, RootContent } from 'hast'
import { z } from 'zod'
import { API_V2_TIMEOUT_MS, apiV2Base } from './api-v2-page'

/**
 * Contact details read from api_v2's data collections (#3185). A page names a
 * record with `::contact{collection record fields}`; the details are read at
 * request time, the way api_v2 pages are, so a changed phone number shows on
 * every page with no page edit and no deploy. A missing record, or a failed
 * read, shows nothing rather than an error.
 */

/** A record a page's contact block names. */
export interface ContactRef {
  collection: string
  record: string
}

/** Copied from apps/api_v2/src/routes/contracts.ts (`getCollectionRecords`). */
const CollectionRecords = z.object({
  collection: z.object({
    key: z.string(),
    schema: z.object({
      fields: z.array(z.object({ key: z.string(), label: z.string() })),
    }),
  }),
  records: z.array(
    z.object({
      record_key: z.string(),
      data: z.record(z.string(), z.string()),
    }),
  ),
})

type CollectionRecords = z.infer<typeof CollectionRecords>

/** The records a page's contact blocks read, by collection, then record key. */
export type ContactRecords = Record<
  string,
  {
    collection: CollectionRecords['collection']
    records: Record<string, Record<string, string>>
  }
>

/** Every record the page's `::contact` blocks name, once each. */
export function contactRefs(tree: Root): ContactRef[] {
  const found = new Map<string, ContactRef>()
  const visit = (nodes: RootContent[]) => {
    for (const node of nodes) {
      if (node.type !== 'element') continue
      if (node.tagName === 'contact-record') {
        const collection = String(node.properties.collection ?? '')
        const record = String(node.properties.record ?? '')
        if (collection && record)
          found.set(`${collection}/${record}`, { collection, record })
      }
      visit(node.children)
    }
  }
  visit(tree.children)
  return [...found.values()]
}

/**
 * `GET /collections/:key/records`. A 404 is a silent miss; anything else
 * unexpected (status, network, timeout, bad body) is a logged miss.
 */
export async function fetchCollectionRecords(
  base: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CollectionRecords | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_V2_TIMEOUT_MS)
  try {
    const response = await fetchImpl(
      `${base}/collections/${encodeURIComponent(key)}/records`,
      { signal: controller.signal },
    )
    if (response.status !== 200) {
      if (response.status !== 404)
        console.warn(`[api-v2] ${response.status} for collection ${key}`)
      // Release the socket: an unread body pins a keep-alive connection.
      await response.body?.cancel()
      return null
    }
    const body = CollectionRecords.safeParse(await response.json())
    if (body.success) return body.data
    console.warn(`[api-v2] malformed collection ${key}`)
    return null
  } catch (error) {
    console.warn(`[api-v2] request for collection ${key} failed:`, error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The named records, trimmed to just those: the client only needs what the
 * page shows. A record or collection that can't be read is left out.
 */
export async function resolveContactRecords(
  base: string | null,
  refs: ContactRef[],
  fetchImpl: typeof fetch = fetch,
): Promise<ContactRecords> {
  if (!base || refs.length === 0) return {}
  const keys = [...new Set(refs.map((ref) => ref.collection))]
  const read = await Promise.all(
    keys.map((key) => fetchCollectionRecords(base, key, fetchImpl)),
  )
  const result: ContactRecords = {}
  keys.forEach((key, index) => {
    const body = read[index]
    if (!body) return
    const wanted = new Set(
      refs.filter((ref) => ref.collection === key).map((ref) => ref.record),
    )
    const records: Record<string, Record<string, string>> = {}
    for (const row of body.records)
      if (wanted.has(row.record_key)) records[row.record_key] = row.data
    result[key] = { collection: body.collection, records }
  })
  return result
}

const ContactRefs = z
  .array(z.object({ collection: z.string().min(1), record: z.string().min(1) }))
  .max(50)

/** Server function: `resolveContactRecords` against the configured api_v2. */
export const getContactRecords = createServerFn()
  .validator((refs: ContactRef[]) => ContactRefs.parse(refs))
  .handler(({ data: refs }) => resolveContactRecords(apiV2Base(), refs))
