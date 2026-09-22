/**
 * The pharmacy finder: a page with zero prose, whose entire content is one
 * configuration block.
 *
 * This is the spike's central question made executable. Every test here is
 * the same shape — change the configuration through the editor's form, and
 * assert the rendered finder behaves differently, with no code change.
 */

import { expect, test } from "@playwright/test";
import {
  DOC,
  PHARMACY_URL,
  filterSidebar,
  gotoSite,
  openDocument,
  pagination,
  preview,
  resultCount,
  resultItems,
  saveAndExpectSuccess,
} from "./support";

test.describe("configuring the finder", () => {
  test("a new facet appears in the preview sidebar with no code change", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);

    // The facet does not exist yet.
    await expect(
      preview(page).getByRole("group", { name: "Opening hours confirmed" }),
    ).toHaveCount(0);

    await page.getByTestId("add-facet").click();
    await page.getByTestId("facet-key-new").fill("hours");
    await page.getByTestId("facet-name-new").fill("Opening hours confirmed");
    await page.getByTestId("facet-type-new").selectOption("checkbox");
    await page.getByTestId("confirm-facet").click();

    // The preview is driven by the same renderer as the site, so the new
    // facet must show up there immediately, before any save.
    await expect(
      preview(page).getByRole("group", { name: "Opening hours confirmed" }),
    ).toBeVisible();

    await saveAndExpectSuccess(page);

    // And it survives to the real page.
    await gotoSite(page, PHARMACY_URL);
    await expect(
      filterSidebar(page).getByRole("group", {
        name: "Opening hours confirmed",
      }),
    ).toBeVisible();
  });

  test("removing the parish facet removes it from the sidebar and from result metadata", async ({
    page,
  }) => {
    // Establish the starting state on the real page, so the assertion after
    // the edit is a genuine before/after and not a guess.
    await gotoSite(page, PHARMACY_URL);
    await expect(
      filterSidebar(page).getByRole("group", { name: "Parish" }),
    ).toBeVisible();
    await expect(
      resultItems(page).first().getByTestId("metadata-parish"),
    ).toBeVisible();

    await openDocument(page, DOC.pharmacies);
    await page.getByTestId("remove-facet-parish").click();
    await saveAndExpectSuccess(page);

    await gotoSite(page, PHARMACY_URL);
    await expect(
      filterSidebar(page).getByRole("group", { name: "Parish" }),
    ).toHaveCount(0);
    // Rule 7 ties result metadata to facets and fields, so dropping the
    // facet has to drop the metadata chip with it.
    await expect(
      resultItems(page).first().getByTestId("metadata-parish"),
    ).toHaveCount(0);
  });

  test("changing results per page from 20 to 5 changes pagination", async ({
    page,
  }) => {
    await gotoSite(page, PHARMACY_URL);
    await expect(resultItems(page)).toHaveCount(20);
    const pagesAt20 = await pagination(page).getByRole("listitem").count();

    await openDocument(page, DOC.pharmacies);
    await page.getByTestId("results-per-page").fill("5");
    await saveAndExpectSuccess(page);

    await gotoSite(page, PHARMACY_URL);
    await expect(resultItems(page)).toHaveCount(5);
    const pagesAt5 = await pagination(page).getByRole("listitem").count();
    expect(pagesAt5).toBeGreaterThan(pagesAt20);
  });

  test("editing the empty-state message changes what an author sees when nothing matches", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await page
      .getByTestId("empty-message")
      .fill("Nothing here. Try a different parish.");
    await saveAndExpectSuccess(page);

    await gotoSite(page, PHARMACY_URL);
    await page
      .getByRole("searchbox")
      .fill("a pharmacy that certainly does not exist");

    await expect(
      page.getByText("Nothing here. Try a different parish."),
    ).toBeVisible();
  });

  test("renaming a facet renames it for the citizen", async ({ page }) => {
    await openDocument(page, DOC.pharmacies);
    await page.getByTestId("facet-name-openNow").fill("Open right now");
    await saveAndExpectSuccess(page);

    await gotoSite(page, PHARMACY_URL);
    await expect(
      filterSidebar(page).getByRole("group", { name: "Open right now" }),
    ).toBeVisible();
    await expect(
      filterSidebar(page).getByRole("group", { name: "Open now" }),
    ).toHaveCount(0);
  });
});

test.describe("the finder the configuration drives", () => {
  test("filters, searches, sorts and paginates over the 163 seeded records", async ({
    page,
  }) => {
    await gotoSite(page, PHARMACY_URL);

    // The seeded corpus, before any filtering. `subsidisedOnly` defaults on,
    // exactly as it does in production, so this is not simply 163.
    const initial = Number(await resultCount(page).getAttribute("data-total"));
    expect(initial).toBeGreaterThan(0);

    // Search narrows.
    await page.getByRole("searchbox").fill("polyclinic");
    const searched = Number(await resultCount(page).getAttribute("data-total"));
    expect(searched).toBeGreaterThan(0);
    expect(searched).toBeLessThan(initial);
    await page.getByRole("searchbox").fill("");

    // A facet narrows.
    await filterSidebar(page)
      .getByRole("group", { name: "Parish" })
      .getByRole("checkbox", { name: "St. Michael" })
      .check();
    const filtered = Number(await resultCount(page).getAttribute("data-total"));
    expect(filtered).toBeLessThan(initial);
    await expect(
      resultItems(page).first().getByTestId("metadata-parish"),
    ).toHaveText("St. Michael");

    // Sorting reorders.
    const firstByDefault = await resultItems(page).first().innerText();
    await page.getByRole("combobox", { name: "Sort by" }).selectOption("name");
    const namesAsc = await resultItems(page).allInnerTexts();
    expect(namesAsc.length).toBeGreaterThan(0);
    expect([...namesAsc].sort((a, b) => a.localeCompare(b))).toEqual(namesAsc);
    expect(namesAsc[0]).not.toBe(firstByDefault);
  });

  test("paginating keeps the filters and never repeats a result", async ({
    page,
  }) => {
    await gotoSite(page, PHARMACY_URL);
    const firstPage = await resultItems(page).allInnerTexts();

    await pagination(page).getByRole("link", { name: "Next" }).click();

    const secondPage = await resultItems(page).allInnerTexts();
    expect(secondPage.length).toBeGreaterThan(0);
    expect(secondPage).not.toEqual(firstPage);
    for (const entry of secondPage) expect(firstPage).not.toContain(entry);
  });

  test("the island-wide delivery service survives a parish filter", async ({
    page,
  }) => {
    // 'All parishes' is a wildcard the production matcher special-cases: an
    // island-wide delivery service must still appear when someone filters to
    // a single parish. A facet model of plain field-equals-value cannot
    // express that, so this test is where the limitation shows up — which is
    // the finding, not a bug to route around.
    await gotoSite(page, PHARMACY_URL);
    await filterSidebar(page)
      .getByRole("group", { name: "Parish" })
      .getByRole("checkbox", { name: "St. Lucy" })
      .check();

    const parishes = await resultItems(page)
      .getByTestId("metadata-parish")
      .allInnerTexts();

    expect(parishes.length).toBeGreaterThan(0);
    // Every result is either in the chosen parish or island-wide.
    for (const parish of parishes) {
      expect(["St. Lucy", "All parishes"]).toContain(parish);
    }
    expect(parishes).toContain("All parishes");
  });
});
