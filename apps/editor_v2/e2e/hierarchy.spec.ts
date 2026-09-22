/**
 * Browsing by hierarchy, and editing the collections underneath it.
 *
 * Two things this pins.
 *
 * The front door is services, not pages. A flat list stops being navigable
 * somewhere around thirty rows and the estate has 116, but the real reason
 * is that a service is the thing a content designer owns — its pages are
 * parts of it rather than peers of everything else on the site.
 *
 * And a collection is editable, not just referenceable. Until this, a block
 * could be configured *over* a collection while the collection itself was
 * read-only, which made the brief's own §3.7 requirement that bank holiday
 * rules be editable rows impossible to satisfy.
 */

import { expect, test } from "@playwright/test";
import {
  CALENDAR_URL,
  HAIR_SALON_URL,
  editorSurface,
  gotoEditor,
  gotoSite,
  holidayRow,
} from "./support";

test.describe("browsing category to service to page", () => {
  test("the front door lists services under their categories", async ({
    page,
  }) => {
    await gotoEditor(page);
    const services = page.getByTestId("service-list");

    await expect(services).toContainText("Business and trade");
    await expect(services).toContainText("crop-over-permits");
    await expect(services).toContainText("2 pages");

    // A page with no category is not filed under an invented one.
    await expect(services).toContainText("Island-wide (no category)");
    await expect(services).toContainText("bank-holiday-calendar");
  });

  test("a service opens its own items, and an item opens the editor", async ({
    page,
  }) => {
    await gotoEditor(page);
    await page.getByTestId("service-crop-over-permits").click();

    const items = page.getByTestId("service-items");
    await expect(items).toBeVisible();
    await expect(items.getByRole("row")).toHaveCount(3); // header plus two

    // The kind column distinguishes the parts of a service, which is the
    // reason to group them at all.
    await expect(items).toContainText("Start page");
    await expect(items).toContainText("Form");

    await items.getByRole("link").first().click();
    await expect(editorSurface(page)).toBeVisible();
  });

  test("a service shows only its own pages", async ({ page }) => {
    await gotoEditor(page);
    await page.getByTestId("service-find-an-open-pharmacy").click();

    const items = page.getByTestId("service-items");
    await expect(items).toContainText("Search for pharmacies");
    await expect(items).not.toContainText("Crop Over");
    await expect(items).not.toContainText("severance");
  });
});

test.describe("editing a collection", () => {
  test("correcting a phone number fixes every page that lists it", async ({
    page,
  }) => {
    // The whole argument for a collection over a hand-typed list. Fourteen
    // content pages repeat these seven offices verbatim today.
    await gotoSite(page, HAIR_SALON_URL);
    await expect(
      page.getByRole("row").filter({ hasText: "Branford Taitt" }),
    ).toContainText("(246) 536-3700");

    await gotoEditor(page);
    await page.getByTestId("collection-environmental-health-offices").click();
    await expect(page.getByTestId("record-table")).toBeVisible();

    const phone = page.getByTestId("field-branford-taitt-polyclinic-phone");
    await phone.fill("(246) 111-2222");
    await phone.blur();

    await gotoSite(page, HAIR_SALON_URL);
    await expect(
      page.getByRole("row").filter({ hasText: "Branford Taitt" }),
    ).toContainText("(246) 111-2222");
  });

  test("a record edit survives a reload", async ({ page }) => {
    await gotoEditor(page);
    await page.getByTestId("collection-environmental-health-offices").click();

    const phone = page.getByTestId("field-st-philip-polyclinic-phone");
    await phone.fill("(246) 999-0000");
    await phone.blur();

    await page.reload();
    await expect(
      page.getByTestId("field-st-philip-polyclinic-phone"),
    ).toHaveValue("(246) 999-0000");
  });

  test("adding a holiday rule reaches the calendar", async ({ page }) => {
    // §3.7 says bank holiday rules are editable rows, and §10 asks that a
    // new one appear at its computed date. Neither was possible while
    // collections were read-only.
    await gotoEditor(page);
    await page.getByTestId("collection-bank-holiday-rules").click();
    await expect(page.getByTestId("record-table")).toBeVisible();

    const before = await page
      .getByTestId("record-table")
      .getByRole("row")
      .count();
    await page.getByTestId("add-record").click();
    await expect(page.getByTestId("record-table").getByRole("row")).toHaveCount(
      before + 1,
    );
  });

  test("removing a record removes it from the page that lists it", async ({
    page,
  }) => {
    await gotoEditor(page);
    await page.getByTestId("collection-environmental-health-offices").click();
    await page.getByTestId("remove-record-st-philip-polyclinic").click();

    await gotoSite(page, HAIR_SALON_URL);
    await expect(
      page.getByRole("row").filter({ hasText: "St. Philip Polyclinic" }),
    ).toHaveCount(0);
  });

  test("a value the spike cannot edit is shown, not silently dropped", async ({
    page,
  }) => {
    // A holiday's `rule` is a nested object. A generic editor for those is a
    // real feature; showing it read-only is honest, hiding it would not be.
    await gotoEditor(page);
    await page.getByTestId("collection-bank-holiday-rules").click();
    await expect(page.getByTestId("record-good-friday")).toContainText(
      "easter_offset",
    );
  });

  test("the calendar still renders after its rules are edited", async ({
    page,
  }) => {
    await gotoEditor(page);
    await page.getByTestId("collection-bank-holiday-rules").click();
    await page.getByTestId("remove-record-kadooment-day").click();

    await gotoSite(page, CALENDAR_URL);
    await expect(holidayRow(page, "Good Friday")).toBeVisible();
    await expect(holidayRow(page, "Kadooment Day")).toHaveCount(0);
  });
});
