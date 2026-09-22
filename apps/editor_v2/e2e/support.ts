/**
 * Shared vocabulary for the behavioural suite.
 *
 * This file is the UI contract. The editor and the site are built to the
 * selectors named here, not the other way round — if a helper below has to
 * change shape to make a test pass, that is a finding about the design, not
 * a detail to paper over.
 *
 * Selector policy, deliberately split:
 *
 *   - The SITE is queried by accessible role and name only. Those pages are
 *     citizen-facing, so every selector here doubles as an assertion that
 *     the block renderer emits an accessible tree. A test that can only be
 *     written with a test id is telling you the markup is wrong.
 *
 *   - The EDITOR is queried by test id. It is an internal tool whose DOM is
 *     going to churn hard across the spike, and pinning it to accessible
 *     names would make every copy change a test failure for no safety gain.
 */

import { expect, type Locator, type Page } from '@playwright/test'

export const SEVERANCE_URL =
  '/money-financial-support/calculate-severance-pay/start'
export const CALENDAR_URL = '/bank-holiday-calendar'
export const PHARMACY_URL =
  '/health-and-emergency-services/find-an-open-pharmacy/find'

/** Titles as seeded, used to pick a document out of the editor's list. */
export const DOC = {
  severance: 'Find out how much severance payment you are owed',
  calendar: 'Check bank holiday dates',
  pharmacies: 'Search for pharmacies',
} as const

/**
 * PGlite compiles WASM and runs the migration and seed on first paint.
 * Every helper that lands on a page goes through here so no test races the
 * boot, and so "the database came up at all" fails in one obvious place
 * rather than as a puzzling selector timeout twenty lines later.
 */
export async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByTestId('db-ready')).toBeAttached({ timeout: 60_000 })
}

export async function gotoEditor(page: Page): Promise<void> {
  await page.goto('/editor')
  await waitForReady(page)
}

/** Open a seeded document by its title. */
export async function openDocument(page: Page, title: string): Promise<void> {
  await gotoEditor(page)
  await page.getByTestId('doc-list').getByRole('link', { name: title }).click()
  await expect(page.getByTestId('block-list')).toBeVisible()
}

export async function gotoSite(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await waitForReady(page)
}

/* ------------------------------------------------------------- the editor */

export const blockByType = (page: Page, type: string): Locator =>
  page.getByTestId(`block-type-${type}`).first()

export const preview = (page: Page): Locator => page.getByTestId('preview')

/** The serialized body, exposed read-only so round-trip is observable. */
export async function bodyJson(page: Page): Promise<string> {
  await page.getByTestId('doc-json-toggle').click()
  const text = await page.getByTestId('doc-json').innerText()
  await page.getByTestId('doc-json-toggle').click()
  return text
}

export async function save(page: Page): Promise<void> {
  await page.getByTestId('save').click()
}

/** Save and assert it was accepted — no error summary, state back to clean. */
export async function saveAndExpectSuccess(page: Page): Promise<void> {
  await save(page)
  await expect(page.getByTestId('save-status')).toHaveText(/saved/i)
  await expect(page.getByTestId('error-summary')).toHaveCount(0)
}

/** Save and assert it was rejected, returning the error summary locator. */
export async function saveAndExpectRejection(page: Page): Promise<Locator> {
  await save(page)
  const summary = page.getByTestId('error-summary')
  await expect(summary).toBeVisible()
  return summary
}

export async function insertBlock(page: Page, type: string): Promise<void> {
  await page.getByTestId('insert-block').click()
  await page.getByTestId(`insert-${type}`).click()
}

/* --------------------------------------------------------------- the site */

export const filterSidebar = (page: Page): Locator =>
  page.getByRole('complementary', { name: 'Filters' })

export const results = (page: Page): Locator =>
  page.getByRole('list', { name: 'Results' })

export const resultItems = (page: Page): Locator =>
  results(page).getByRole('listitem')

export const resultCount = (page: Page): Locator =>
  page.getByTestId('result-count')

export const pagination = (page: Page): Locator =>
  page.getByRole('navigation', { name: 'Pagination' })

export const calendarTable = (page: Page): Locator =>
  page.getByRole('table', { name: 'Bank holidays' })

/** The row for a named holiday in a given year's section of the calendar. */
export function holidayRow(page: Page, name: string): Locator {
  return calendarTable(page).getByRole('row').filter({ hasText: name })
}
