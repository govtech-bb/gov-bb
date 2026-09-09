/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../lib/search'
import { ServiceSearch } from './ServiceSearch'

const { navigateMock, suggestMock, trackEventMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  suggestMock: vi.fn(),
  trackEventMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))
vi.mock('../lib/analytics', () => ({ trackEvent: trackEventMock }))
vi.mock('../lib/search', () => ({ suggest: suggestMock }))

const HITS: Array<SearchHit> = Array.from({ length: 5 }, (_, index) => ({
  id: `service:${index}`,
  title: index === 0 ? 'Get a birth certificate' : `Service ${index + 1}`,
  description: '',
  href:
    index === 0
      ? '/family-birth-relationships/get-birth-certificate'
      : `/service-${index + 1}`,
  digital: false,
  kind: 'service',
}))

function renderSearch(
  props: Partial<React.ComponentProps<typeof ServiceSearch>> = {},
) {
  return render(<ServiceSearch source="home" viewer="public" {...props} />)
}

function listboxFor(input: HTMLElement): HTMLUListElement {
  const id = input.getAttribute('aria-controls')
  const listbox = id ? document.getElementById(id) : null
  if (!(listbox instanceof HTMLUListElement)) {
    throw new Error('Autocomplete listbox is not connected to its input')
  }
  return listbox
}

function optionsFor(input: HTMLElement): Array<HTMLLIElement> {
  return Array.from(listboxFor(input).querySelectorAll('[role="option"]'))
}

function typeInto(input: HTMLElement, value: string) {
  input.focus()
  fireEvent.input(input, { target: { value } })
}

beforeEach(() => {
  navigateMock.mockReset()
  suggestMock.mockReset()
  trackEventMock.mockReset()
  suggestMock.mockImplementation((query: string) =>
    query.trim().length >= 3 ? HITS : [],
  )
})

afterEach(cleanup)

describe('ServiceSearch', () => {
  it('keeps the design-system GET form and accessible combobox relationship', () => {
    renderSearch()

    const form = screen.getByRole('search')
    const input = screen.getByRole('combobox', {
      name: 'Search for a service',
    })
    const listbox = listboxFor(input)

    expect(form.getAttribute('action')).toBe('/search-results')
    expect(form.getAttribute('method')).toBe('get')
    expect(input.getAttribute('name')).toBe('q')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('aria-labelledby')).toBeNull()
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    expect(listbox.getAttribute('aria-labelledby')).toBe(`${input.id}-label`)
    expect(listbox.hidden).toBe(true)
  })

  it('does not open for a prefilled query before the user types', () => {
    renderSearch({ defaultValue: 'birth' })

    const input = screen.getByRole<HTMLInputElement>('combobox')
    expect(input.value).toBe('birth')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(listboxFor(input).hidden).toBe(true)
  })

  it('waits for three characters and shows no more than five options', () => {
    renderSearch()
    const input = screen.getByRole('combobox')

    typeInto(input, 'bi')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(optionsFor(input)).toHaveLength(0)

    typeInto(input, 'bir')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(optionsFor(input)).toHaveLength(5)
  })

  it('keeps focus on the input and selects one highlighted option with Enter', () => {
    renderSearch()
    const input = screen.getByRole<HTMLInputElement>('combobox')
    typeInto(input, 'bir')
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const activeId = input.getAttribute('aria-activedescendant')
    expect(document.activeElement).toBe(input)
    expect(activeId).toBeTruthy()
    expect(document.getElementById(activeId ?? '')).toBe(optionsFor(input)[0])

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(trackEventMock).toHaveBeenCalledTimes(2)
  })

  it('closes on Escape without clearing or navigating', () => {
    renderSearch()
    const input = screen.getByRole<HTMLInputElement>('combobox')
    typeInto(input, 'bir')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.value).toBe('bir')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('does not select a highlighted option on Tab or blur', () => {
    renderSearch()
    const input = screen.getByRole<HTMLInputElement>('combobox')
    typeInto(input, 'bir')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button') })

    expect(input.value).toBe('bir')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(trackEventMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it.each(['keyboard', 'pointer'] as const)(
    'tracks and submits an official title selected by %s',
    (method) => {
      renderSearch({ source: 'results' })
      const input = screen.getByRole<HTMLInputElement>('combobox')
      typeInto(input, 'bir')

      if (method === 'keyboard') {
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        fireEvent.keyDown(input, { key: 'Enter' })
      } else {
        fireEvent.click(optionsFor(input)[0])
      }

      expect(trackEventMock.mock.calls).toEqual([
        [
          'search-suggestion-select',
          {
            query: 'bir',
            title: HITS[0].title,
            href: HITS[0].href,
            position: 1,
            source: 'results',
          },
        ],
        ['search-submit', { query: HITS[0].title, source: 'results' }],
      ])
      expect(navigateMock).toHaveBeenCalledTimes(1)
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/search-results',
        search: { q: HITS[0].title },
      })
    },
  )

  it('submits unmatched free text without a selection event', () => {
    renderSearch({ source: 'services' })
    const input = screen.getByRole<HTMLInputElement>('combobox')
    typeInto(input, '  something else  ')
    fireEvent.submit(screen.getByRole('search'))

    expect(trackEventMock.mock.calls).toEqual([
      ['search-submit', { query: 'something else', source: 'services' }],
    ])
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/search-results',
      search: { q: 'something else' },
    })
  })

  it('preserves both empty-query destinations', () => {
    const first = renderSearch({ emptyHref: '/services' })
    fireEvent.submit(screen.getByRole('search'))
    expect(navigateMock).toHaveBeenLastCalledWith({ to: '/services' })

    first.unmount()
    navigateMock.mockClear()
    renderSearch({ source: 'services' })
    fireEvent.submit(screen.getByRole('search'))
    expect(navigateMock).toHaveBeenLastCalledWith({
      to: '/search-results',
      search: { q: '' },
    })
  })

  it('keeps the list closed when there are no suggestions', () => {
    suggestMock.mockReturnValue([])
    renderSearch()
    const input = screen.getByRole('combobox')
    typeInto(input, 'none')

    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(optionsFor(input)).toHaveLength(0)
    expect(listboxFor(input).hidden).toBe(true)
  })
})
