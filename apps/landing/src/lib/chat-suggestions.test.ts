import { describe, expect, it, vi } from 'vitest'
import {
  publicChatSuggestions,
  readServedChatSuggestions,
  servedChatSuggestions,
} from './chat-suggestions'

const v2Mocks = vi.hoisted(() => ({
  getApiV2Page: vi.fn(),
}))
vi.mock('./api-v2-page', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...v2Mocks,
}))

const BIRTH = '/family-birth-relationships/get-birth-certificate'
const FINANCIAL = '/money-financial-support/apply-financial-assistance'
const TEXTBOOK = '/money-financial-support/get-a-primary-school-textbook-grant'
const MAIL = '/travel-id-citizenship/post-office-redirection-individual'
const NOTARISED = '/travel-id-citizenship/get-a-document-notarised'

describe('publicChatSuggestions', () => {
  it('returns the first four public curated questions', () => {
    expect(publicChatSuggestions(new Map())).toEqual([
      'How do I get a birth certificate?',
      'What financial assistance is available?',
      'How do I get a primary school textbook grant?',
      'How do I redirect my personal mail?',
    ])
  })

  it('replaces a disabled service with the next public suggestion', () => {
    expect(
      publicChatSuggestions(new Map([['get-birth-certificate', 'preview']])),
    ).toEqual([
      'What financial assistance is available?',
      'How do I get a primary school textbook grant?',
      'How do I redirect my personal mail?',
      'How do I get a document notarised?',
    ])
  })
})

describe('servedChatSuggestions', () => {
  it('drops a target api_v2 does not serve and fills in the next', () => {
    expect(
      servedChatSuggestions(new Set([FINANCIAL, TEXTBOOK, MAIL, NOTARISED])),
    ).toEqual([
      'What financial assistance is available?',
      'How do I get a primary school textbook grant?',
      'How do I redirect my personal mail?',
      'How do I get a document notarised?',
    ])
  })

  it('returns the first four when api_v2 serves every target', () => {
    expect(
      servedChatSuggestions(
        new Set([BIRTH, FINANCIAL, TEXTBOOK, MAIL, NOTARISED]),
      ),
    ).toEqual([
      'How do I get a birth certificate?',
      'What financial assistance is available?',
      'How do I get a primary school textbook grant?',
      'How do I redirect my personal mail?',
    ])
  })

  it('returns none when api_v2 serves nothing', () => {
    expect(servedChatSuggestions(new Set())).toEqual([])
  })
})

describe('readServedChatSuggestions', () => {
  it('counts a page, redirect or compile miss as served, other misses not', async () => {
    const results: Record<string, unknown> = {
      [BIRTH]: { kind: 'page', page: {}, cacheControl: null },
      [FINANCIAL]: { kind: 'redirect', to: '/x', cacheControl: null },
      [TEXTBOOK]: { kind: 'miss', reason: 'compile', cacheControl: null },
      [MAIL]: { kind: 'miss', reason: 'not_found', cacheControl: null },
      [NOTARISED]: { kind: 'miss', reason: 'status' },
    }
    v2Mocks.getApiV2Page.mockImplementation(
      async ({ data }: { data: string }) => results[data],
    )

    expect(await readServedChatSuggestions()).toEqual([
      'How do I get a birth certificate?',
      'What financial assistance is available?',
      'How do I get a primary school textbook grant?',
    ])
    expect(v2Mocks.getApiV2Page).toHaveBeenCalledTimes(5)
    for (const url of Object.keys(results)) {
      expect(v2Mocks.getApiV2Page).toHaveBeenCalledWith({ data: url })
    }
  })
})
