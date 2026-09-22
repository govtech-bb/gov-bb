/**
 * The severance start page: all prose, no configuration.
 *
 * The round trip is the thing under test. A block editor that quietly
 * rewrites an em dash, drops a bold run or renumbers an anchor is not a
 * content model, it is a lossy import — and the damage is invisible until
 * someone diffs two years of content.
 */

import { expect, test } from '@playwright/test'
import {
  DOC,
  SEVERANCE_URL,
  bodyJson,
  gotoSite,
  openDocument,
  preview,
  save,
  saveAndExpectSuccess,
} from './support'

test.describe('round trip', () => {
  test('saving with no edits leaves the body byte-identical', async ({
    page,
  }) => {
    await openDocument(page, DOC.severance)

    const before = await bodyJson(page)
    await saveAndExpectSuccess(page)
    const after = await bodyJson(page)

    expect(after).toBe(before)
  })

  test('a second save after a reload is still byte-identical', async ({
    page,
  }) => {
    // Catches a normalisation that is stable but wrong — one that mangles
    // the document once and then agrees with itself forever after.
    await openDocument(page, DOC.severance)
    const original = await bodyJson(page)
    await saveAndExpectSuccess(page)

    await page.reload()
    await expect(page.getByTestId('block-list')).toBeVisible()
    await saveAndExpectSuccess(page)

    expect(await bodyJson(page)).toBe(original)
  })

  test('bold, the em dash and list structure survive an edit elsewhere', async ({
    page,
  }) => {
    await openDocument(page, DOC.severance)

    // Touch one unrelated paragraph, then check the canaries are intact.
    await page.getByTestId('block-b_sv04').getByRole('textbox').fill(
      'About 4 minutes.',
    )
    await saveAndExpectSuccess(page)
    await page.reload()
    await expect(page.getByTestId('block-list')).toBeVisible()

    const body = await bodyJson(page)

    // The em dash, not a hyphen and not an HTML entity.
    expect(body).toContain('gross pay — include overtime or bonuses')
    // The bold run is still its own span carrying the mark.
    expect(JSON.parse(body)).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          id: 'b_sv02',
          content: expect.arrayContaining([
            { text: 'estimate', marks: ['strong'] },
          ]),
        }),
        expect.objectContaining({
          id: 'b_sv07',
          type: 'list',
          ordered: false,
          items: expect.arrayContaining([
            expect.objectContaining({ id: 'b_sv07c' }),
          ]),
        }),
      ]),
    })
    // And the edit actually landed.
    expect(body).toContain('About 4 minutes.')
  })

  test('block ids are never reassigned by an edit', async ({ page }) => {
    // Ids are what future diffing, commenting and per-block approval anchor
    // to. A renumber on save would invalidate all of it silently.
    await openDocument(page, DOC.severance)
    const idsBefore = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { id: string }) => b.id,
    )

    await page
      .getByTestId('block-b_sv01')
      .getByRole('textbox')
      .fill('You should complete the calculator in one sitting.')
    await saveAndExpectSuccess(page)

    const idsAfter = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { id: string }) => b.id,
    )
    expect(idsAfter).toEqual(idsBefore)
  })

  test('an inserted block gets an id that is new and stable', async ({
    page,
  }) => {
    await openDocument(page, DOC.severance)
    const idsBefore: string[] = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { id: string }) => b.id,
    )

    await page.getByTestId('insert-block').click()
    await page.getByTestId('insert-paragraph').click()
    await saveAndExpectSuccess(page)

    const idsAfter: string[] = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { id: string }) => b.id,
    )
    const added = idsAfter.filter((id) => !idsBefore.includes(id))
    expect(added).toHaveLength(1)

    await page.reload()
    await expect(page.getByTestId('block-list')).toBeVisible()
    const idsReloaded = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { id: string }) => b.id,
    )
    expect(idsReloaded).toEqual(idsAfter)
  })
})

test.describe('editing prose', () => {
  test('a heading edit reaches the preview but leaves its anchor alone', async ({
    page,
  }) => {
    // The anchor is a URL fragment. Someone has linked to it. Retyping the
    // heading text must not silently break that link.
    await openDocument(page, DOC.severance)
    const heading = page.getByTestId('block-b_sv05')

    await heading.getByRole('textbox').fill('What you need to have ready')

    await expect(
      preview(page).getByRole('heading', { name: 'What you need to have ready' }),
    ).toBeVisible()

    await saveAndExpectSuccess(page)
    expect(JSON.parse(await bodyJson(page)).blocks).toContainEqual(
      expect.objectContaining({
        id: 'b_sv05',
        anchor: 'what-you-will-need',
      }),
    )
  })

  test('reordering blocks reorders the rendered page', async ({ page }) => {
    await openDocument(page, DOC.severance)

    await page.getByTestId('block-b_sv03').getByTestId('move-up').click()
    await saveAndExpectSuccess(page)

    const order = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { id: string }) => b.id,
    )
    expect(order.indexOf('b_sv03')).toBeLessThan(order.indexOf('b_sv02'))

    await gotoSite(page, SEVERANCE_URL)
    const headingBox = await page
      .getByRole('heading', { name: 'How long does it take?' })
      .boundingBox()
    const paragraphBox = await page
      .getByText('This tool only gives an')
      .boundingBox()
    expect(headingBox!.y).toBeLessThan(paragraphBox!.y)
  })

  test('deleting a block removes it from the page', async ({ page }) => {
    await openDocument(page, DOC.severance)
    await page.getByTestId('block-b_sv04').getByTestId('delete-block').click()
    await saveAndExpectSuccess(page)

    await gotoSite(page, SEVERANCE_URL)
    await expect(page.getByText('About 3 minutes.')).toHaveCount(0)
  })

  test('leaving with unsaved changes is flagged, not silently discarded', async ({
    page,
  }) => {
    await openDocument(page, DOC.severance)
    await expect(page.getByTestId('save-status')).toHaveText(/saved/i)

    await page.getByTestId('block-b_sv04').getByRole('textbox').fill('Ages.')
    await expect(page.getByTestId('save-status')).toHaveText(/unsaved/i)

    await save(page)
    await expect(page.getByTestId('save-status')).toHaveText(/saved/i)
  })
})
