// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHELTER_CONTENT } from '../-data/emergency-shelters'
import {
  ALPHA_SHELTER,
  BETA_SHELTER,
  SHELTER_CONTENT_FIXTURE,
} from '../-data/shelter-fixtures'
import { formatCopy } from '../-lib/copy'
import { EMERGENCY_SHELTER_FIND_HREF } from '../-lib/routes'
import { FindEmergencyShelterPage } from './find-page'
import { EmergencyShelterGuidancePage } from './guidance-page'
import { EmergencyShelterLandingPage } from './landing-page'
import { ShelterFinder } from './shelter-finder'

const copy = SHELTER_CONTENT_FIXTURE.copy
let locate: PositionCallback
let locationError: PositionErrorCallback

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.stubGlobal(
    'navigator',
    Object.create(navigator, {
      geolocation: {
        value: {
          getCurrentPosition: vi.fn((success, error) => {
            locate = success
            locationError = error
          }),
        },
      },
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function names(container: HTMLElement) {
  return [...container.querySelectorAll('li h3')].map(
    (heading) => heading.textContent,
  )
}

describe('shelter content preview', () => {
  it('keeps all published renderers identical with default or explicit published content', () => {
    for (const Page of [
      EmergencyShelterLandingPage,
      FindEmergencyShelterPage,
      EmergencyShelterGuidancePage,
    ]) {
      expect(renderToString(<Page />)).toBe(
        renderToString(<Page content={SHELTER_CONTENT} />),
      )
    }
  })

  it('previews landing copy, review dates, season and emergency numbers from the directory', () => {
    const draft = structuredClone(SHELTER_CONTENT_FIXTURE)
    draft.copy.metadata.title = 'Draft shelter service'
    draft.copy.landing.useItems = ['Draft use guidance']
    draft.lastUpdated = '2027-01-06'
    draft.nextReview = '2028-01-06'
    draft.season = 'Draft season dates'
    draft.phoneDirectory[0].entries[0].landingLabel = 'Draft emergency help'
    draft.phoneDirectory[0].entries[0].contacts[0].display = '555-0199'
    draft.phoneDirectory[0].entries[0].contacts[0].tel = 'tel:+12465550199'
    render(<EmergencyShelterLandingPage content={draft} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: draft.copy.metadata.title,
      }),
    ).toBeTruthy()
    expect(screen.getByText(draft.season)).toBeTruthy()
    expect(screen.getByText('Draft use guidance')).toBeTruthy()
    expect(
      screen.getByText(
        formatCopy(copy.common.freshness, {
          lastUpdated: 'January 6th, 2027',
          nextReview: 'January 6th, 2028',
        }),
      ),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: /Draft emergency help\s*555-0199/ })
        .getAttribute('href'),
    ).toBe('tel:+12465550199')
    expect(
      screen
        .getByRole('link', { name: copy.landing.findLabel })
        .getAttribute('href'),
    ).toBe(EMERGENCY_SHELTER_FIND_HREF)
    expect(screen.queryByText('555-0101')).toBeNull()
  })

  it('recomputes guidance accessibility lists from edited draft records', () => {
    const view = render(
      <EmergencyShelterGuidancePage content={SHELTER_CONTENT_FIXTURE} />,
    )
    let section = within(
      screen.getByRole('region', { name: copy.guidance.accessible.heading }),
    )
    expect(
      section.getByText(
        formatCopy(copy.guidance.accessible.introduction, { count: 2 }),
      ),
    ).toBeTruthy()
    expect(
      section.getByText(`${ALPHA_SHELTER.name} — ${ALPHA_SHELTER.parish}`),
    ).toBeTruthy()
    const draft = {
      ...SHELTER_CONTENT_FIXTURE,
      shelters: SHELTER_CONTENT_FIXTURE.shelters.map((shelter) => ({
        ...shelter,
        name:
          shelter.id === BETA_SHELTER.id
            ? 'Draft accessible hall'
            : shelter.name,
        access: shelter.id === BETA_SHELTER.id,
      })),
    }
    view.rerender(<EmergencyShelterGuidancePage content={draft} />)
    section = within(
      screen.getByRole('region', { name: copy.guidance.accessible.heading }),
    )
    expect(
      section.getByText(
        formatCopy(copy.guidance.accessible.introduction, { count: 1 }),
      ),
    ).toBeTruthy()
    expect(
      section.getByText(`Draft accessible hall — ${BETA_SHELTER.parish}`),
    ).toBeTruthy()
    expect(
      section.queryByText(`${ALPHA_SHELTER.name} — ${ALPHA_SHELTER.parish}`),
    ).toBeNull()
  })

  it('previews guidance bullets, terms, district contacts and every directory field', () => {
    const draft = structuredClone(SHELTER_CONTENT_FIXTURE)
    draft.copy.guidance.goBag.heading = 'Draft packing list'
    draft.copy.guidance.goBag.items = ['Draft packing item']
    draft.copy.guidance.rules.prohibitedItems = []
    draft.districtChairs[0].name = 'Draft Chair'
    draft.districtChairs[0].number = '555-0180'
    draft.districtChairs[0].tel = 'tel:+12465550180'
    draft.hurricaneTerms[0].definition = 'Draft term definition.'
    draft.phoneDirectory[0].heading = 'Draft phone directory'
    draft.phoneDirectory[0].entries[0].label = 'Draft switchboard label'
    draft.phoneDirectory[0].entries[0].contacts[0].note = 'Draft contact note'
    render(<EmergencyShelterGuidancePage content={draft} />)
    expect(
      screen.getByRole('heading', { name: 'Draft packing list' }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Draft packing list' })
        .getAttribute('href'),
    ).toBe('#go-bag')
    expect(screen.getByText('Draft packing item')).toBeTruthy()
    expect(screen.getByText('Draft term definition.')).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Draft phone directory' }),
    ).toBeTruthy()
    expect(screen.getByText('Draft switchboard label')).toBeTruthy()
    expect(screen.getByText('Draft contact note')).toBeTruthy()
    fireEvent.click(screen.getByText(copy.guidance.districts.summary))
    expect(screen.getByText(/Draft Chair/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '555-0180' }).getAttribute('href'),
    ).toBe('tel:+12465550180')
  })

  it('previews finder records, derived counts and planning capacity without changing published data', () => {
    const published = JSON.stringify(SHELTER_CONTENT)
    const view = render(
      <FindEmergencyShelterPage content={SHELTER_CONTENT_FIXTURE} />,
    )
    expect(
      screen.getByText(formatCopy(copy.findPage.introduction, { count: 3 })),
    ).toBeTruthy()
    const draft = structuredClone(SHELTER_CONTENT_FIXTURE)
    draft.shelters = [
      {
        ...ALPHA_SHELTER,
        name: 'Draft school',
        capacity: 91,
        address: 'Draft address',
        access: false,
      },
    ]
    draft.copy.findPage.title = 'Draft finder title'
    draft.copy.finder.searchLabel = 'Search draft shelters'
    view.rerender(<FindEmergencyShelterPage content={draft} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: draft.copy.findPage.title,
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(formatCopy(copy.findPage.introduction, { count: 1 })),
    ).toBeTruthy()
    expect(
      screen.getByText(formatCopy(copy.finder.accessibilityHint, { count: 0 })),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Draft school' })).toBeTruthy()
    expect(screen.getByText('Draft address')).toBeTruthy()
    expect(
      screen.getByText(
        formatCopy(copy.card.capacity, {
          parish: ALPHA_SHELTER.parish,
          ownership: copy.card.publicOwnership,
          capacity: 91,
        }),
      ),
    ).toBeTruthy()
    fireEvent.change(
      screen.getByRole('searchbox', { name: draft.copy.finder.searchLabel }),
      { target: { value: 'absent' } },
    )
    expect(screen.getByText(copy.finder.noMatches)).toBeTruthy()
    expect(
      screen
        .getAllByRole('link', { name: '555-0101' })
        .every((link) => link.getAttribute('href') === 'tel:+12465550101'),
    ).toBe(true)
    expect(JSON.stringify(SHELTER_CONTENT)).toBe(published)
  })

  it('filters by category, accessibility and parish, and clears the filters', () => {
    const view = render(<ShelterFinder content={SHELTER_CONTENT_FIXTURE} />)
    fireEvent.click(
      screen.getByRole('checkbox', { name: copy.finder.accessibleLabel }),
    )
    expect(names(view.container)).toEqual([
      ALPHA_SHELTER.name,
      'Example Gamma School',
    ])
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: formatCopy(copy.common.categoryLabel, { category: 2 }),
      }),
    )
    expect(screen.getByText(copy.finder.noMatches)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.clearAllLabel }),
    )
    expect(names(view.container)).toHaveLength(3)
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.parishHeading }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'St. Philip' }))
    expect(names(view.container)).toEqual([BETA_SHELTER.name])
  })

  it('hydrates shareable filters and applies the chosen capacity sort', () => {
    window.history.replaceState(
      {},
      '',
      '/?parish=St.+Michael&cat=1&access=1&sort=capacity',
    )
    const view = render(<ShelterFinder content={SHELTER_CONTENT_FIXTURE} />)
    expect(names(view.container)).toEqual([
      ALPHA_SHELTER.name,
      'Example Gamma School',
    ])
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: copy.finder.sortLabel,
      }).value,
    ).toBe('capacity')
    expect(new URLSearchParams(window.location.search).get('access')).toBe('1')
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.clearAllLabel }),
    )
    expect(names(view.container)[0]).toBe(BETA_SHELTER.name)
  })

  it('keeps exact and parish-centroid distances and falls back for an off-island location', () => {
    const view = render(<ShelterFinder content={SHELTER_CONTENT_FIXTURE} />)
    fireEvent.click(screen.getByRole('button', { name: copy.location.use }))
    act(() =>
      locate({
        coords: { latitude: 13.1, longitude: -59.6 },
      } as GeolocationPosition),
    )
    expect(names(view.container)[0]).toBe(ALPHA_SHELTER.name)
    expect(screen.getByText('Very close')).toBeTruthy()
    expect(screen.getByText(/km from your parish/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: copy.location.refresh }))
    act(() =>
      locate({
        coords: { latitude: 51.5, longitude: -0.1 },
      } as GeolocationPosition),
    )
    expect(screen.getByText(copy.location.outsideBarbados)).toBeTruthy()
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: copy.finder.sortLabel,
      }).value,
    ).toBe('parish')
  })

  it('keeps parish filtering available after denied or timed-out location requests', () => {
    render(<ShelterFinder content={SHELTER_CONTENT_FIXTURE} />)
    for (const [code, label] of [
      [1, copy.location.permissionDenied],
      [3, copy.location.timedOut],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: copy.location.use }))
      act(() => locationError({ code } as GeolocationPositionError))
      expect(screen.getByText(label)).toBeTruthy()
      expect(
        screen.getByRole<HTMLSelectElement>('combobox', {
          name: copy.finder.sortLabel,
        }).value,
      ).toBe('parish')
    }
    expect(
      screen.getByRole('searchbox', { name: copy.finder.searchLabel }),
    ).toBeTruthy()
  })

  it('paginates a fixed directory, resets after search and keeps printing available', () => {
    const draft = {
      ...SHELTER_CONTENT_FIXTURE,
      shelters: Array.from({ length: 13 }, (_, index) => ({
        ...ALPHA_SHELTER,
        id: `example-${index}`,
        name: `Example School ${index}`,
      })),
    }
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const view = render(<ShelterFinder content={draft} />)
    expect(names(view.container)).toHaveLength(12)
    fireEvent.click(
      screen.getByRole('button', {
        name: formatCopy(copy.finder.showMore, { count: 1 }),
      }),
    )
    expect(names(view.container)).toHaveLength(13)
    fireEvent.change(
      screen.getByRole('searchbox', { name: copy.finder.searchLabel }),
      { target: { value: 'Example School 12' } },
    )
    expect(names(view.container)).toEqual(['Example School 12'])
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.printLabel }),
    )
    expect(print).toHaveBeenCalledOnce()
  })
})
