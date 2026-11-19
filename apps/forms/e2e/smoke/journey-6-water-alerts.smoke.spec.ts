/**
 * Journey 6 (#3013): water alerts subscribe → confirmation email → confirm →
 * unsubscribe, on the landing site.
 *
 * Runs nightly against sandbox and alerts Slack on failure.
 *
 * The journey, with a fresh test-inbox address (never a real person's):
 *   1. Sign up for water alerts on the landing water-outages page.
 *   2. Wait for the confirmation email in the test inbox.
 *   3. Open its confirm link: the page says the alerts are on, and opening it
 *      again says "Already confirmed" — the subscription is active.
 *   4. Open its unsubscribe link: opening alone changes nothing (the page
 *      waits for a click, so mail scanners can't unsubscribe anyone). Press
 *      Unsubscribe: the page says they've stopped, doing it again says
 *      "Already unsubscribed", and the confirm link is no longer valid — the
 *      subscription has stopped.
 *
 * State is read from the public confirm/unsubscribe pages: the API has no
 * other way to look up a subscription, and this test adds none.
 *
 * Cleanup: once the email has arrived, the unsubscribe link is opened in
 * afterAll even if a step failed, so no test subscription is left on. If the
 * email never arrives the sign-up stays pending (unconfirmed), which never
 * gets an alert.
 *
 * Required env:
 *   SMOKE_BASE_URL     forms base URL (the smoke config requires it; unused here)
 *   E2E_LANDING_URL    landing base URL
 *   E2E_INBOX_*, AWS   the test inbox — see ../helpers/test-inbox.ts
 */
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { testInboxAddress, waitForEmail } from "../helpers/test-inbox";

const PAGE_PATH = "/health-and-emergency-services/water-outages";
const EMAIL_TIMEOUT = 3 * 60_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Journey 6 needs ${name} to be set`);
  return value;
}

async function expectHeading(
  page: Page,
  url: string,
  heading: string | RegExp,
) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
}

/**
 * Click a server-rendered button until `then` passes: a click that lands
 * before React hydrates does nothing, so retry rather than fail.
 */
async function clickUntil(button: Locator, then: () => Promise<void>) {
  await expect(async () => {
    // Gone once a click has landed; then only wait for the result.
    if (await button.isVisible()) await button.click({ timeout: 5_000 });
    await then();
  }).toPass({ timeout: 30_000 });
}

/** Open an unsubscribe link and press its button (the page waits for a click). */
async function unsubscribe(page: Page, url: string, heading: string | RegExp) {
  await expectHeading(page, url, "Unsubscribe from water alerts");
  const button = page.getByRole("button", { name: "Unsubscribe", exact: true });
  await clickUntil(button, () =>
    expect(page.getByRole("heading", { level: 1 })).toHaveText(heading, {
      timeout: 5_000,
    }),
  );
}

// Set once the confirmation email has arrived; afterAll unsubscribes with it.
let unsubscribeLink: string | undefined;

test.afterAll(async ({ browser }) => {
  if (!unsubscribeLink) return;
  const page = await browser.newPage();
  try {
    await unsubscribe(
      page,
      unsubscribeLink,
      /^(You have been unsubscribed|Already unsubscribed)$/,
    );
  } finally {
    await page.close();
  }
});

test.describe("Journey 6 — water alerts subscribe, confirm, unsubscribe", () => {
  test("a test-inbox sign-up is confirmed by email, then unsubscribed", async ({
    page,
  }) => {
    test.setTimeout(EMAIL_TIMEOUT + 2 * 60_000);
    const landing = new URL(required("E2E_LANDING_URL"));
    const email = testInboxAddress("water-alerts");
    const since = new Date();

    await test.step("sign up on the water-outages page", async () => {
      await page.goto(new URL(PAGE_PATH, landing).href);
      const form = page.getByRole("form", { name: "Get email alerts" });
      // The toggle (type=button), not the form's submit of the same name.
      const toggle = page.locator('button[type="button"]', {
        hasText: "Get email alerts",
      });
      await clickUntil(toggle, () =>
        expect(form).toBeVisible({ timeout: 2_000 }),
      );
      await form.getByLabel("Your email address").fill(email);
      await form.getByRole("button", { name: "Get email alerts" }).click();
      await expect(page.getByRole("status")).toContainText(
        "Check your email and click the link to confirm.",
      );
    });

    const { confirmLink, unsubLink } =
      await test.step("the confirmation email arrives", async () => {
        const message = await waitForEmail({
          to: email,
          subjectIncludes: "Confirm your water alerts",
          since,
          timeoutMs: EMAIL_TIMEOUT,
        });
        const find = (path: string) =>
          message.links.find((link) =>
            new URL(link).pathname.endsWith(`${PAGE_PATH}/${path}`),
          );
        const links = {
          confirmLink: find("confirm"),
          unsubLink: find("unsubscribe"),
        };
        expect(links.unsubLink, "unsubscribe link in the email").toBeTruthy();
        // Clean up on the landing site under test even if the link points
        // elsewhere (the origin check below fails the run for that).
        const unsub = new URL(links.unsubLink!);
        unsubscribeLink = new URL(unsub.pathname + unsub.search, landing).href;
        expect(links.confirmLink, "confirm link in the email").toBeTruthy();
        // The links are built from the API's LANDING_BASE_URL; one pointing
        // anywhere else would confirm against the wrong environment.
        for (const link of [links.confirmLink, links.unsubLink]) {
          expect(
            new URL(link!).origin,
            "email link origin — is the API's LANDING_BASE_URL set for this environment?",
          ).toBe(landing.origin);
        }
        return links as { confirmLink: string; unsubLink: string };
      });

    await test.step("the confirm link turns the alerts on", async () => {
      await expectHeading(page, confirmLink, "You're all set");
      await expectHeading(page, confirmLink, "Already confirmed");
    });

    await test.step("just opening the unsubscribe link changes nothing", async () => {
      // A mail scanner pre-opening links must not stop the alerts.
      await expectHeading(page, unsubLink, "Unsubscribe from water alerts");
      await expectHeading(page, confirmLink, "Already confirmed");
    });

    await test.step("the unsubscribe link stops the alerts", async () => {
      await unsubscribe(page, unsubLink, "You have been unsubscribed");
      await unsubscribe(page, unsubLink, "Already unsubscribed");
      await expectHeading(page, confirmLink, "This link is not valid");
    });
  });
});
