/**
 * Two tabs, one leader PGlite instance, live queries.
 *
 * The acceptance criterion is "editing in one tab updates the site in
 * another, with no rebuild and no reload". Both pages therefore live in the
 * same browser context — a fresh context would be a different storage
 * partition and the test would prove nothing.
 */

import { expect, test } from "@playwright/test";
import {
  CALENDAR_URL,
  DOC,
  PHARMACY_URL,
  filterSidebar,
  gotoSite,
  openDocument,
  resultItems,
  replaceText,
  saveAndExpectSuccess,
} from "./support";

test.describe("editor in one tab, site in another", () => {
  test("prose edited in the editor appears on the site without a reload", async ({
    context,
  }) => {
    const site = await context.newPage();
    await gotoSite(site, CALENDAR_URL);
    await expect(site.getByText("Last updated on")).toBeVisible();

    const editor = await context.newPage();
    await openDocument(editor, DOC.calendar);
    await replaceText(
      editor,
      "b_bh01",
      "Public holidays in Barbados, updated live.",
    );
    await saveAndExpectSuccess(editor);

    // No site.reload() anywhere in this test. The live query has to do it.
    await expect(
      site.getByText("Public holidays in Barbados, updated live."),
    ).toBeVisible();
  });

  test("a facet added in the editor appears in the live site sidebar", async ({
    context,
  }) => {
    const site = await context.newPage();
    await gotoSite(site, PHARMACY_URL);
    await expect(
      filterSidebar(site).getByRole("group", { name: "Pharmacy type" }),
    ).toBeVisible();

    const editor = await context.newPage();
    await openDocument(editor, DOC.pharmacies);
    await editor.getByTestId("remove-facet-type").click();
    await saveAndExpectSuccess(editor);

    await expect(
      filterSidebar(site).getByRole("group", { name: "Pharmacy type" }),
    ).toHaveCount(0);
  });

  test("changing results per page repaginates the live site", async ({
    context,
  }) => {
    const site = await context.newPage();
    await gotoSite(site, PHARMACY_URL);
    await expect(resultItems(site)).toHaveCount(20);

    const editor = await context.newPage();
    await openDocument(editor, DOC.pharmacies);
    await editor.getByTestId("results-per-page").fill("5");
    await saveAndExpectSuccess(editor);

    await expect(resultItems(site)).toHaveCount(5);
  });

  test("two editor tabs on different documents do not disturb each other", async ({
    context,
  }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await openDocument(a, DOC.severance);
    await openDocument(b, DOC.calendar);

    await replaceText(a, "b_sv04", "Minutes.");
    await saveAndExpectSuccess(a);

    await expect(b.getByTestId("conflict-notice")).toHaveCount(0);
    await replaceText(b, "b_bh01", "Holidays for the current year.");
    await saveAndExpectSuccess(b);
  });
});
