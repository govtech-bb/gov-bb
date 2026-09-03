import { describe, expect, it } from 'vitest'
import { publicChatSuggestions } from './chat-suggestions'

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
