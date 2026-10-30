/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiV2SearchDocument } from '../lib/api-v2-site'
import { ServiceSearch } from './ServiceSearch'

// Real `suggest`: only the router and analytics are stubbed.
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

const ZEBRA: ApiV2SearchDocument = {
  url: '/travel/zebra-crossing-permit',
  title: 'Zebra crossing permit',
  description: null,
  digital: false,
  keywords: [],
  chunks: [],
}

const NONE: readonly ApiV2SearchDocument[] = []

/** Renders the search with `lists` loaded in turn, one per edit. */
function renderWith(...lists: Array<readonly ApiV2SearchDocument[]>) {
  const loadDocuments = vi.fn(async () => lists.shift() ?? NONE)
  render(
    <ServiceSearch
      source="home"
      viewer="public"
      loadDocuments={loadDocuments}
    />,
  )
  const input = screen.getByRole('combobox')
  input.focus()
  return (value: string) => fireEvent.input(input, { target: { value } })
}

const suggestion = () => screen.queryByRole('option', { name: ZEBRA.title })

afterEach(cleanup)

describe('ServiceSearch with api_v2 documents', () => {
  it('suggests an api_v2-only page, and drops it once a later load does', async () => {
    const type = renderWith([ZEBRA], NONE)
    type('zebr')
    await screen.findByRole('option', { name: ZEBRA.title })

    type('zebra')
    await vi.waitFor(() => expect(suggestion()).toBeNull())
  })

  it('recovers when a first load is empty', async () => {
    const type = renderWith(NONE, [ZEBRA])
    type('zebr')
    await Promise.resolve()
    expect(suggestion()).toBeNull()

    type('zebra')
    await screen.findByRole('option', { name: ZEBRA.title })
  })
})
