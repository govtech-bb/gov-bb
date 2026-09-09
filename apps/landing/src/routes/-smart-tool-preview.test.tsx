/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SmartToolPreview, publishedContent } from './-smart-tool-preview'
import type { PharmacyContent } from './health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies'

beforeEach(() =>
  vi.stubEnv('VITE_START_PAGE_EDITOR_ORIGIN', 'https://builder.example.test'),
)
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

it('renders only validated messages from the configured parent and retains the last valid draft', () => {
  const content = structuredClone(
    publishedContent('pharmacies'),
  ) as unknown as PharmacyContent
  content.pharmacies[0].name = 'Draft preview pharmacy'
  const message = {
    source: 'gov-bb-smart-tool-editor',
    version: 1,
    id: 'pharmacies',
    recordId: content.pharmacies[0].slug,
    view: 'detail',
    content,
  }
  render(<SmartToolPreview />)
  const send = (
    data = message,
    origin = 'https://builder.example.test',
    source: MessageEventSource | null = window.parent,
  ) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, origin, source }),
      )
    })
  send(message, 'https://another.example.test')
  send(message, 'https://builder.example.test', null)
  expect(
    screen.queryAllByRole('heading', { name: content.pharmacies[0].name }),
  ).toHaveLength(0)
  send({ ...message, version: 2 })
  expect(
    screen.queryAllByRole('heading', { name: content.pharmacies[0].name }),
  ).toHaveLength(0)
  send()
  expect(
    screen.getAllByRole('heading', { name: content.pharmacies[0].name }).length,
  ).toBeGreaterThan(0)
  send({ ...message, view: 'unsupported' })
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(
    screen.getAllByRole('heading', { name: content.pharmacies[0].name }).length,
  ).toBeGreaterThan(0)
  send({ ...message, content: { ...content, lastUpdated: 'invalid-date' } })
  expect(screen.getByRole('alert')).toBeTruthy()
  send()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('fails closed on deployed previews without an editor origin', () => {
  vi.stubEnv('VITE_START_PAGE_EDITOR_ORIGIN', '')
  vi.stubEnv('DEV', false)
  render(<SmartToolPreview />)
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window.parent,
        origin: 'https://builder.example.test',
        data: {
          source: 'gov-bb-smart-tool-editor',
          version: 1,
          id: 'pharmacies',
          view: 'detail',
          content: publishedContent('pharmacies'),
        },
      }),
    ),
  )
  expect(screen.queryAllByRole('heading')).toHaveLength(0)
})
