/**
 * Storage behaviour: migration, seeding, idempotency and persistence across
 * reloads, all against real PGlite in real IndexedDB.
 *
 * Every test in the suite gets a fresh browser context, so "the migration
 * and the seed run on first load" is already exercised everywhere. What is
 * tested here is the part that only shows up on the SECOND load.
 */

import { expect, test } from "@playwright/test";
import {
  CALENDAR_URL,
  DOC,
  gotoEditor,
  block,
  SEEDED_DOCUMENT_COUNT,
  gotoSite,
  openDocument,
  resultCount,
  PHARMACY_URL,
  replaceText,
  saveAndExpectSuccess,
  waitForReady,
} from "./support";

test.describe("first run and every run after it", () => {
  test("the seed produces its documents once, and a reload does not duplicate them", async ({
    page,
  }) => {
    await gotoEditor(page);
    // Counted through the store, not a list: the front door groups pages by
    // service, so no single list shows every document.
    const count = () =>
      page.evaluate(async () => {
        const store = (
          window as unknown as {
            __spikeStore: { list: () => Promise<unknown[]> };
          }
        ).__spikeStore;
        return (await store.list()).length;
      });
    expect(await count()).toBe(SEEDED_DOCUMENT_COUNT);

    await page.reload();
    await waitForReady(page);
    expect(await count()).toBe(SEEDED_DOCUMENT_COUNT);

    // A third load, for the avoidance of doubt — an idempotency bug that
    // needs two reloads to show up is still an idempotency bug.
    await page.reload();
    await waitForReady(page);
    expect(await count()).toBe(SEEDED_DOCUMENT_COUNT);
  });

  test("the pharmacy collection seeds 163 records once", async ({ page }) => {
    await gotoSite(page, PHARMACY_URL);
    const first = await resultCount(page).getAttribute("data-collection-size");
    expect(Number(first)).toBe(163);

    await page.reload();
    await waitForReady(page);
    expect(
      Number(await resultCount(page).getAttribute("data-collection-size")),
    ).toBe(163);
  });

  test("an edit survives a reload — it is in Postgres, not in React state", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);
    await replaceText(page, "b_sv04", "About 7 minutes.");
    await saveAndExpectSuccess(page);

    await page.reload();
    await waitForReady(page);
    await expect(block(page, "b_sv04")).toHaveText("About 7 minutes.");
  });

  test("resetting drops, migrates and reseeds back to the shipped state", async ({
    page,
  }) => {
    await openDocument(page, DOC.calendar);
    await page.getByTestId("remove-rule-kadooment-day").click();
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);
    await expect(page.getByText("Kadooment Day")).toHaveCount(0);

    await gotoEditor(page);
    await page.getByTestId("reset-data").click();
    await waitForReady(page);

    await expect(page.getByTestId("service-list")).toBeVisible();
    await gotoSite(page, CALENDAR_URL);
    await expect(page.getByText("Kadooment Day").first()).toBeVisible();
  });
});

test.describe("one origin, one database", () => {
  test("the editor and the site are served from the same origin", async ({
    page,
  }) => {
    // IndexedDB is scoped per origin. If these ever diverge the two halves
    // of the spike stop being able to see each other's data at all.
    await gotoEditor(page);
    const editorOrigin = new URL(page.url()).origin;

    await gotoSite(page, PHARMACY_URL);
    expect(new URL(page.url()).origin).toBe(editorOrigin);
  });

  test("a change made in the editor is visible to the site on next load", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await page.getByTestId("document-title").fill("Find a pharmacy near you");
    await saveAndExpectSuccess(page);

    await gotoSite(page, PHARMACY_URL);
    await expect(
      page.getByRole("heading", { name: "Find a pharmacy near you", level: 1 }),
    ).toBeVisible();
  });
});
