/**
 * landing-start.spec.ts
 *
 * Tests the smoke suite's landing hop (`startFromLanding` / `openSmokeForm` in
 * helpers/smoke.ts, #3008) against a fake landing start page. The live smokes
 * enter a form through landing's "Start now" link, so a Start link pointing at
 * the wrong host or form must fail the run — and fail BEFORE the click, or the
 * smoke would submit a real application into whichever environment the link
 * named.
 *
 * Routes registered in a test take precedence over the api-mock fixture's.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/api-mock";
import { openSmokeForm, startFromLanding } from "./helpers/smoke";

const LANDING = "https://landing.test";
const START_PATH = "/work-employment/master/start";
const START_URL = `${LANDING}${START_PATH}`;

/** Serve a landing start page whose only button is `link` (or none). */
async function serveStartPage(page: Page, link: string | null): Promise<void> {
  const button = link
    ? `<a class="govbb-button" href="${link}">Start now</a>`
    : "";
  await page.route(`${LANDING}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Start</title><main>${button}</main>`,
    }),
  );
}

test.describe("smoke landing hop", () => {
  test("follows Start now onto the form on the forms host", async ({
    page,
    baseURL,
  }) => {
    const formsOrigin = new URL(baseURL!).origin;
    await serveStartPage(page, `${formsOrigin}/forms/master`);

    await startFromLanding(page, START_URL, formsOrigin, "master");

    expect(new URL(page.url()).pathname).toBe("/forms/master");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("fails on a Start link to another host, without following it", async ({
    page,
    baseURL,
  }) => {
    const formsOrigin = new URL(baseURL!).origin;
    await serveStartPage(page, "https://forms.other.test/forms/master");

    await expect(
      startFromLanding(page, START_URL, formsOrigin, "master"),
    ).rejects.toThrow(/forms\.other\.test/);
    // Still on landing: a mismatched link must never be followed, or the
    // smoke would submit into the environment it points at.
    expect(page.url()).toBe(START_URL);
  });

  test("fails on a Start link to a different form", async ({
    page,
    baseURL,
  }) => {
    const formsOrigin = new URL(baseURL!).origin;
    await serveStartPage(page, `${formsOrigin}/forms/some-other-form`);

    await expect(
      startFromLanding(page, START_URL, formsOrigin, "master"),
    ).rejects.toThrow(/some-other-form/);
    expect(page.url()).toBe(START_URL);
  });

  test("fails on a relative Start link, which stays on landing's host", async ({
    page,
    baseURL,
  }) => {
    const formsOrigin = new URL(baseURL!).origin;
    await serveStartPage(page, "/forms/master");

    await expect(
      startFromLanding(page, START_URL, formsOrigin, "master"),
    ).rejects.toThrow(/landing\.test\/forms\/master/);
    expect(page.url()).toBe(START_URL);
  });

  test("reports the status when the start page itself is missing", async ({
    page,
    baseURL,
  }) => {
    await page.route(`${LANDING}/**`, (route) =>
      route.fulfill({ status: 404, body: "Not found" }),
    );

    await expect(
      startFromLanding(page, START_URL, new URL(baseURL!).origin, "master"),
    ).rejects.toThrow(/HTTP 404/);
  });

  test("names the suppressed button when landing renders no Start now", async ({
    page,
    baseURL,
  }) => {
    await serveStartPage(page, null);

    await expect(
      startFromLanding(page, START_URL, new URL(baseURL!).origin, "master"),
    ).rejects.toThrow(/unavailable/);
  });

  test("refuses a landing run for a spec with no start path", async ({
    page,
  }) => {
    const before = process.env.SMOKE_LANDING_URL;
    process.env.SMOKE_LANDING_URL = LANDING;
    try {
      await expect(openSmokeForm(page, "master")).rejects.toThrow(
        /landingStartPath/,
      );
    } finally {
      if (before === undefined) delete process.env.SMOKE_LANDING_URL;
      else process.env.SMOKE_LANDING_URL = before;
    }
  });
});
