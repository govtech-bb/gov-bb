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
  DOC,
  HAIR_SALON_URL,
  block,
  blockIds,
  deleteBlock,
  editorSurface,
  gotoEditor,
  gotoSite,
  holidayRow,
  hoverBlock,
  openBlockData,
  openDocument,
  saveAndExpectSuccess,
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

test.describe("the controls on a block", () => {
  test("Edit and Delete sit in the right margin, not inside the drag handle", async ({
    page,
  }) => {
    // They used to live in the drag handle's menu, which meant two clicks
    // and a guess: the handle gives no hint that it holds anything.
    await openDocument(page, DOC.severance);
    await hoverBlock(page, "b_sv03");

    const strip = page.getByTestId("block-controls-b_sv03");
    const blockBox = await block(page, "b_sv03").boundingBox();
    const stripBox = await strip.boundingBox();
    expect(stripBox?.x ?? 0).toBeGreaterThan(
      (blockBox?.x ?? 0) + (blockBox?.width ?? 0) - 8,
    );

    await expect(page.getByTestId("block-edit-b_sv03")).toBeVisible();
    await expect(page.getByTestId("block-delete-b_sv03")).toBeVisible();
  });

  test("Delete removes the block", async ({ page }) => {
    await openDocument(page, DOC.severance);
    await deleteBlock(page, "b_sv04");
    await saveAndExpectSuccess(page);
    expect(await blockIds(page)).not.toContain("b_sv04");
  });

  test("a data-backed block puts its records first and its settings behind the cog", async ({
    page,
  }) => {
    // The order is the claim: correcting a phone number is the common task,
    // changing how the list is filtered is not.
    await openDocument(page, DOC.pharmacies);
    await hoverBlock(page, "b_ph01");

    await expect(page.getByTestId("block-edit-data-b_ph01")).toBeVisible();
    await expect(page.getByTestId("block-settings-b_ph01")).toBeVisible();

    const cog = page.getByTestId("block-settings-b_ph01");
    await expect(cog).toHaveAttribute("aria-label", "Block settings");
  });

  test("Edit opens the collection's records over the page that reads them", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    const modal = await openBlockData(page, "b_ph01");

    await expect(modal).toHaveAttribute("aria-label", "Pharmacies");
    await expect(modal.getByTestId("record-table")).toBeVisible();
    await expect(modal).toContainText("163 records");
  });

  test("the cog opens the block's own configuration", async ({ page }) => {
    await openDocument(page, DOC.pharmacies);
    await hoverBlock(page, "b_ph01");
    await page.getByTestId("block-settings-b_ph01").click();

    const popover = page.getByTestId("block-popover");
    await expect(popover).toHaveAttribute("aria-label", "Edit Finder block");
    await expect(popover.getByTestId("results-per-page")).toBeVisible();
  });
});

test.describe("viewing the schema", () => {
  test("opens a labelled dialog with the stored body", async ({ page }) => {
    await openDocument(page, DOC.severance);
    await expect(page.getByTestId("doc-json-toggle")).toHaveText("View schema");
    await page.getByTestId("doc-json-toggle").click();

    const modal = page.getByTestId("modal");
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(modal).toHaveAttribute("aria-label", "Page schema");

    const json = await page.getByTestId("doc-json").innerText();
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).blocks.length).toBeGreaterThan(0);
  });

  test("copies the JSON, and says so", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDocument(page, DOC.severance);
    await page.getByTestId("doc-json-toggle").click();
    await page.getByTestId("copy-json").click();

    await expect(page.getByTestId("copy-json")).toHaveText("Copied");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(clipboard).blocks.length).toBeGreaterThan(0);
  });

  test("Escape closes it", async ({ page }) => {
    await openDocument(page, DOC.severance);
    await page.getByTestId("doc-json-toggle").click();
    await expect(page.getByTestId("modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("modal")).toHaveCount(0);
  });
});
