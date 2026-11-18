import { afterEach, describe, expect, it, vi } from 'vitest'
import { processMarkdown } from '../utils/markdown/processor'
import {
  contactRefs,
  fetchCollectionRecords,
  resolveContactRecords,
} from './api-v2-collections'
import { apiV2Breaker } from './api-v2-reader'

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

afterEach(() => {
  vi.restoreAllMocks()
  apiV2Breaker.reset()
})

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
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = stubFetch(json(404, { error: 'not_found' }))
    expect(await fetchCollectionRecords(BASE, 'contacts', fetchImpl)).toBeNull()
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['a server error', json(500, {})],
    ['a malformed body', json(200, { records: 'no' })],
    ['a network failure', new Error('ECONNREFUSED')],
  ])(
    'is a miss on %s, logged as an api_v2_fallback error',
    async (_, response) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(
        await fetchCollectionRecords(BASE, 'contacts', stubFetch(response)),
      ).toBeNull()
      expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
        event: 'api_v2_fallback',
        url: '/collections/contacts/records',
      })
    },
  )
})

describe('resolveContactRecords', () => {
  it('passes landing’s token to each collection read', async () => {
    const fetchImpl = stubFetch(json(200, CONTACTS))
    await resolveContactRecords(
      BASE,
      [{ collection: 'contacts', record: 'barbados-drug-service' }],
      fetchImpl,
      'landing-secret',
    )
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ 'x-landing-token': 'landing-secret' })
  })

  it('reads at most five collections per call, however many are named', async () => {
    const fetchImpl = stubFetch(json(404, {}))
    await resolveContactRecords(
      BASE,
      Array.from({ length: 50 }, (_, i) => ({
        collection: `c${i}`,
        record: 'x',
      })),
      fetchImpl,
      'landing-secret',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await resolveContactRecords(
        BASE,
        [{ collection: 'contacts', record: 'barbados-drug-service' }],
        stubFetch(new Error('timeout')),
      ),
    ).toEqual({})
  })

  it('leaves the breaker closed when api_v2 rejects every key it is sent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rejecting = vi.fn(async () => json(400, { error: 'bad_request' }))
    expect(
      await resolveContactRecords(
        BASE,
        ['A', 'B', 'C', 'D', 'E'].map((collection) => ({
          collection,
          record: 'x',
        })),
        rejecting,
      ),
    ).toEqual({})
    expect(rejecting).toHaveBeenCalledTimes(5)
    const fetchImpl = stubFetch(json(200, CONTACTS))
    await fetchCollectionRecords(BASE, 'contacts', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('leaves out a collection, without a request, while the breaker is open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = vi.fn(async () => json(500, {}))
    for (let i = 0; i < 3; i++)
      await fetchCollectionRecords(BASE, 'contacts', failing)
    const fetchImpl = stubFetch(json(200, CONTACTS))
    expect(
      await resolveContactRecords(
        BASE,
        [{ collection: 'contacts', record: 'barbados-drug-service' }],
        fetchImpl,
      ),
    ).toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
