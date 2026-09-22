/**
 * The bank holiday calendar: intro prose plus rules that compute dates.
 *
 * The split under test is data versus code. A rule row is editable; the
 * Gregorian Easter arithmetic and the Cap. 352 substitution logic are not.
 * These tests edit the data and assert the code recomputed correctly.
 */

import { expect, test } from "@playwright/test";
import {
  CALENDAR_URL,
  DOC,
  goToYear,
  gotoSite,
  holidayRow,
  openBlockSettings,
  openDocument,
  saveAndExpectSuccess,
} from "./support";

test.describe("rules are data", () => {
  test("adding a holiday rule shows it at the correct computed date", async ({
    page,
  }) => {
    await openDocument(page, DOC.calendar);
    await openBlockSettings(page, "b_bh01");

    await page.getByTestId("add-rule").click();
    await page.getByTestId("rule-key-new").fill("spike-day");
    await page.getByTestId("rule-name-new").fill("Spike Day");
    await page.getByTestId("rule-kind-new").selectOption("easter_offset");
    await page.getByTestId("rule-offset-new").fill("7");
    await page.getByTestId("confirm-rule").click();
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);
    await goToYear(page, 2026);

    // Easter Sunday 2026 is 5 April, so Easter + 7 is 12 April. The date is
    // computed by the ported arithmetic, never stored.
    await expect(holidayRow(page, "Spike Day")).toContainText("12 April 2026");
  });

  test("a fixed-date rule lands on the date it names, every year", async ({
    page,
  }) => {
    await openDocument(page, DOC.calendar);
    await openBlockSettings(page, "b_bh01");
    await page.getByTestId("add-rule").click();
    await page.getByTestId("rule-key-new").fill("census-day");
    await page.getByTestId("rule-name-new").fill("Census Day");
    await page.getByTestId("rule-kind-new").selectOption("fixed");
    await page.getByTestId("rule-month-new").fill("3");
    await page.getByTestId("rule-day-new").fill("14");
    await page.getByTestId("confirm-rule").click();
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);
    for (const year of ["2020", "2026", "2050"]) {
      await goToYear(page, Number(year));
      await expect(holidayRow(page, "Census Day")).toContainText(
        `14 March ${year}`,
      );
    }
  });

  test("deleting a rule removes the holiday from the calendar", async ({
    page,
  }) => {
    await gotoSite(page, CALENDAR_URL);
    await expect(holidayRow(page, "Kadooment Day")).toBeVisible();

    await openDocument(page, DOC.calendar);
    await openBlockSettings(page, "b_bh01");
    await page.getByTestId("remove-rule-kadooment-day").click();
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);
    await expect(holidayRow(page, "Kadooment Day")).toHaveCount(0);
    // The rest of the calendar is untouched.
    await expect(holidayRow(page, "Good Friday")).toBeVisible();
  });

  test("renaming a rule renames the holiday for the citizen", async ({
    page,
  }) => {
    await openDocument(page, DOC.calendar);
    await openBlockSettings(page, "b_bh01");
    await page
      .getByTestId("rule-name-errol-barrow-day")
      .fill("Errol Barrow Day (National)");
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);
    await expect(holidayRow(page, "Errol Barrow Day (National)")).toBeVisible();
  });
});

test.describe("formulas are code", () => {
  test("the moveable feasts compute correctly for 2020, 2026 and 2050", async ({
    page,
  }) => {
    await gotoSite(page, CALENDAR_URL);

    const expected: Record<string, Record<string, string>> = {
      "2020": {
        "Good Friday": "10 April 2020",
        "Easter Monday": "13 April 2020",
        "Kadooment Day": "3 August 2020",
      },
      "2026": {
        "Good Friday": "3 April 2026",
        "Easter Monday": "6 April 2026",
        "Kadooment Day": "3 August 2026",
      },
      "2050": {
        "Good Friday": "8 April 2050",
        "Easter Monday": "11 April 2050",
        "Kadooment Day": "1 August 2050",
      },
    };

    for (const [year, holidays] of Object.entries(expected)) {
      await goToYear(page, Number(year));
      for (const [name, date] of Object.entries(holidays)) {
        await expect(holidayRow(page, name)).toContainText(date);
      }
    }
  });

  test("weekend substitution applies exactly where Cap. 352 applies it", async ({
    page,
  }) => {
    await gotoSite(page, CALENDAR_URL);

    // 1 January 2023 was a Sunday → the Monday is granted.
    await goToYear(page, 2023);
    await expect(holidayRow(page, "lieu of New Year's Day")).toContainText(
      "2 January 2023",
    );

    // 1 January 2022 was a Saturday → the Act grants nothing.
    await goToYear(page, 2022);
    await expect(holidayRow(page, "lieu of New Year's Day")).toHaveCount(0);
    // But 1 August 2022 was a Monday → Emancipation Day moves to the Tuesday.
    await expect(holidayRow(page, "lieu of Emancipation Day")).toContainText(
      "2 August 2022",
    );
    // And 25 December 2022 was a Sunday → Christmas moves to the Tuesday.
    await expect(holidayRow(page, "lieu of Christmas Day")).toContainText(
      "27 December 2022",
    );
  });

  test("switching the substitution policy changes the calendar", async ({
    page,
  }) => {
    // The policy is a block field, so it has to actually do something.
    await openDocument(page, DOC.calendar);
    await openBlockSettings(page, "b_bh01");
    await page.getByTestId("substitution-rule").selectOption("none");
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);
    await goToYear(page, 2023);
    await expect(page.locator(".bk-observed")).toHaveCount(0);
  });

  test("the year range on the block bounds what a citizen can ask for", async ({
    page,
  }) => {
    await openDocument(page, DOC.calendar);
    await openBlockSettings(page, "b_bh01");
    await page.getByTestId("year-range-min").fill("2024");
    await page.getByTestId("year-range-max").fill("2027");
    await saveAndExpectSuccess(page);

    await gotoSite(page, CALENDAR_URL);

    // The bounds are visible rather than buried in a list: at the end of the
    // range the button that would leave it is disabled.
    await goToYear(page, 2024);
    await expect(
      page.getByRole("button", { name: /Previous year/ }),
    ).toBeDisabled();

    await goToYear(page, 2027);
    await expect(
      page.getByRole("button", { name: /Next year/ }),
    ).toBeDisabled();
  });
});
