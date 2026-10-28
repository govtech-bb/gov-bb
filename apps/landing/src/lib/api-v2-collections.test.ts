import { afterEach, describe, expect, it, vi } from 'vitest'
import { processMarkdown } from '../utils/markdown/processor'
import {
  contactRefs,
  fetchCollectionRecords,
  resolveContactRecords,
} from './api-v2-collections'

const BASE = 'http://api.example'

const CONTACTS = {
  collection: {
    key: 'contacts',
    title: 'Contacts',
    record_key: 'key',
    schema: {
      fields: [
        { key: 'key', label: 'Key', type: 'slug' },
        { key: 'phone', label: 'Telephone', type: 'text' },
        { key: 'email', label: 'Email', type: 'email' },
      ],
    },
    schema_version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  records: [
    {
      record_key: 'barbados-drug-service',
      data: { key: 'barbados-drug-service', phone: '(246) 535-0021' },
      updated_at: '2026-10-01T00:00:00.000Z',
    },
    {
      record_key: 'nis-severance-payment-department',
      data: {
        key: 'nis-severance-payment-department',
        phone: '(246) 431-7400',
      },
      updated_at: '2026-10-01T00:00:00.000Z',
    },
  ],
}

function stubFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => vi.restoreAllMocks())

describe('contactRefs', () => {
  it('finds each record a page’s contact blocks name, once', async () => {
    const { hast } = await processMarkdown(
      [
        '## Get help',
        '::contact{collection="contacts" record="barbados-drug-service" fields="phone"}',
        ':::notice',
        '::contact{collection="contacts" record="barbados-drug-service" fields="email"}',
        ':::',
      ].join('\n\n'),
    )
    expect(contactRefs(hast)).toEqual([
      { collection: 'contacts', record: 'barbados-drug-service' },
    ])
  })
})

describe('fetchCollectionRecords', () => {
  it('reads the collection’s public route without a preview token', async () => {
    const fetchImpl = stubFetch(json(200, CONTACTS))
    expect(await fetchCollectionRecords(BASE, 'contacts', fetchImpl)).toEqual(
      expect.objectContaining({ records: expect.any(Array) }),
    )
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/collections/contacts/records`)
    expect(init.headers).toBeUndefined()
  })

  it('is a silent miss on a 404', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = stubFetch(json(404, { error: 'not_found' }))
    expect(await fetchCollectionRecords(BASE, 'contacts', fetchImpl)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['a server error', json(500, {})],
    ['a malformed body', json(200, { records: 'no' })],
    ['a network failure', new Error('ECONNREFUSED')],
  ])('is a logged miss on %s', async (_, response) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await fetchCollectionRecords(BASE, 'contacts', stubFetch(response)),
    ).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})

describe('resolveContactRecords', () => {
  it('keeps only the records the page names', async () => {
    const records = await resolveContactRecords(
      BASE,
      [{ collection: 'contacts', record: 'barbados-drug-service' }],
      stubFetch(json(200, CONTACTS)),
    )
    expect(Object.keys(records.contacts.records)).toEqual([
      'barbados-drug-service',
    ])
    expect(records.contacts.collection.schema.fields).toHaveLength(3)
  })

  it('reads nothing when api_v2 is not configured or nothing is named', async () => {
    const fetchImpl = stubFetch(json(200, CONTACTS))
    expect(
      await resolveContactRecords(
        null,
        [{ collection: 'contacts', record: 'x' }],
        fetchImpl,
      ),
    ).toEqual({})
    expect(await resolveContactRecords(BASE, [], fetchImpl)).toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('leaves out a collection that can’t be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await resolveContactRecords(
        BASE,
        [{ collection: 'contacts', record: 'barbados-drug-service' }],
        stubFetch(new Error('timeout')),
      ),
    ).toEqual({})
  })
})
