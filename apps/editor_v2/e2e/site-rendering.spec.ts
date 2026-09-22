/**
 * The three pages as a citizen meets them.
 *
 * Every selector here is an accessible role and name. That is deliberate:
 * these pages are the citizen-facing half, so a test that can only be
 * written with a test id would be telling us the renderer emits markup a
 * screen reader cannot navigate.
 */

import { expect, test } from "@playwright/test";
import {
  CALENDAR_URL,
  CROP_OVER_URL,
  PHARMACY_URL,
  SEVERANCE_URL,
  calendarTable,
  goToYear,
  gotoSite,
  resultItems,
} from "./support";

test.describe("the severance start page — all prose", () => {
  test("renders its headings, paragraphs and list as real semantic markup", async ({
    page,
  }) => {
    await gotoSite(page, SEVERANCE_URL);

    await expect(
      page.getByRole("heading", {
        name: "Find out how much severance payment you are owed",
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "How long does it take?", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What you will need", level: 2 }),
    ).toBeVisible();

    // The list is a list, not three paragraphs that look like one.
    const list = page.getByRole("list").filter({ hasText: "your start date" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
  });

  test("the em dash and the bold run survive to the rendered page", async ({
    page,
  }) => {
    await gotoSite(page, SEVERANCE_URL);

    await expect(
      page.getByText("include overtime or bonuses", { exact: false }),
    ).toContainText("—");
    await expect(page.getByText("estimate", { exact: true })).toHaveRole(
      "strong",
    );
  });

  test("headings carry the anchor they were authored with", async ({
    page,
  }) => {
    // Someone has linked to these fragments. They are content, not derived.
    await gotoSite(page, SEVERANCE_URL);
    await expect(page.locator("#what-you-will-need")).toBeVisible();
    await expect(page.locator("#how-long-does-it-take")).toBeVisible();
  });

  test("the start link renders as the start button and navigates to the calculator", async ({
    page,
  }) => {
    await gotoSite(page, SEVERANCE_URL);

    const start = page.getByRole("link", { name: "Start your estimate now" });
    await expect(start).toBeVisible();
    // target_kind is 'page', not 'form' — this is the only start page on the
    // site that starts a calculator rather than a form.
    await expect(start).toHaveAttribute(
      "href",
      "/money-financial-support/calculate-severance-pay/form",
    );

    await start.click();
    await expect(page).toHaveURL(
      /\/money-financial-support\/calculate-severance-pay\/form$/,
    );
  });
});

test.describe("the bank holiday calendar — intro prose plus data", () => {
  test("renders the intro and a table of holidays", async ({ page }) => {
    await gotoSite(page, CALENDAR_URL);

    await expect(
      page.getByRole("heading", { name: "Check bank holiday dates", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("Where a holiday falls on a weekend", { exact: false }),
    ).toBeVisible();

    const table = calendarTable(page);
    await expect(table).toBeVisible();
    // The three configured columns, as column headers.
    for (const column of ["Date", "Holiday", "Notes"]) {
      await expect(
        table.getByRole("columnheader", { name: column }),
      ).toBeVisible();
    }
    // Twelve statutory holidays, plus any substitutes for the year.
    await expect(table.getByRole("row")).not.toHaveCount(0);
  });

  test("a substitute day is marked as such, not passed off as the holiday", async ({
    page,
  }) => {
    await gotoSite(page, CALENDAR_URL);
    await goToYear(page, 2023);
    await expect(
      calendarTable(page).getByRole("row").filter({ hasText: "in lieu of" }),
    ).not.toHaveCount(0);
  });
});

test.describe("the pharmacy finder — zero prose", () => {
  test("renders the finder and nothing that pretends to be prose", async ({
    page,
  }) => {
    await gotoSite(page, PHARMACY_URL);

    await expect(
      page.getByRole("heading", { name: "Search for pharmacies", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Filters" }),
    ).toBeVisible();
    await expect(resultItems(page)).not.toHaveCount(0);
  });

  test("each result links to its detail url, built from the template", async ({
    page,
  }) => {
    await gotoSite(page, PHARMACY_URL);
    const first = resultItems(page).first().getByRole("link").first();
    await expect(first).toHaveAttribute(
      "href",
      /^\/health-and-emergency-services\/find-an-open-pharmacy\/[a-z0-9-]+$/,
    );
  });

  test("the result count is announced, not just rendered", async ({ page }) => {
    await gotoSite(page, PHARMACY_URL);
    await expect(page.getByRole("status")).toContainText(/pharmac/i);
  });
});

test.describe("the Crop Over permits page — prose with a callout", () => {
  test("renders the callout as a notice, not as styled prose", async ({
    page,
  }) => {
    // The markdown this page came from drew its callout with a hand-written
    // <div class="border-blue-40 border-l-4 bg-blue-10 p-s">. Tailwind class
    // names in content an author owns is the thing a closed palette exists
    // to stop, so it is a notice block now and the renderer decides what a
    // callout looks like.
    await gotoSite(page, CROP_OVER_URL);

    const notice = page.getByText("Indicative guidance only", {
      exact: false,
    });
    await expect(notice).toBeVisible();
    // No presentational class names survived the port.
    await expect(page.locator('[class*="border-blue-40"]')).toHaveCount(0);
    await expect(page.locator('[class*="bg-blue-10"]')).toHaveCount(0);
  });

  test("keeps the bold run inside the notice", async ({ page }) => {
    // The only seeded notice whose content carries marks — a bold run inside
    // a block that is not a paragraph.
    await gotoSite(page, CROP_OVER_URL);
    await expect(
      page.getByText("Indicative guidance only.", { exact: true }),
    ).toHaveRole("strong");
  });

  test("renders its list with the em dash intact", async ({ page }) => {
    await gotoSite(page, CROP_OVER_URL);
    await expect(page.getByText("Your venue", { exact: false })).toContainText(
      "—",
    );
  });

  test("the start button goes to the permit checklist", async ({ page }) => {
    await gotoSite(page, CROP_OVER_URL);
    const start = page.getByRole("link", { name: "Start now" });
    await expect(start).toHaveAttribute(
      "href",
      "/business-trade/crop-over-permits/form",
    );
    await start.click();
    await expect(page).toHaveURL(/\/business-trade\/crop-over-permits\/form$/);
  });
});

test.describe("the site index", () => {
  test("links to all three pages, and each one loads", async ({ page }) => {
    await gotoSite(page, "/");

    for (const url of [
      SEVERANCE_URL,
      CALENDAR_URL,
      PHARMACY_URL,
      CROP_OVER_URL,
    ]) {
      await expect(page.locator(`a[href="${url}"]`)).toBeVisible();
    }

    await page.locator(`a[href="${CALENDAR_URL}"]`).click();
    await expect(
      page.getByRole("heading", { name: "Check bank holiday dates", level: 1 }),
    ).toBeVisible();
  });

  test("every page has exactly one h1", async ({ page }) => {
    for (const url of [
      SEVERANCE_URL,
      CALENDAR_URL,
      PHARMACY_URL,
      CROP_OVER_URL,
    ]) {
      await gotoSite(page, url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });
});
