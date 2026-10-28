/**
 * Journey 7 (#3014): forms analytics events reach Umami and the analytics
 * dashboard.
 *
 * Runs nightly against sandbox and alerts Slack on failure. It never gates a
 * deploy: Umami data can arrive late, so a slow ingest must not block a
 * promotion.
 *
 * The journey, against a DEDICATED non-public test form (`e2e-analytics-check`,
 * never a real form):
 *   1. Read the form's funnel counts on the dashboard (the baseline).
 *   2. Walk the form and submit it, capturing every Umami event the browser
 *      sends; assert the expected event names, each carrying the form ID.
 *   3. Reload the dashboard until each funnel count has gone up.
 *
 * Test data stays out of the real figures: sandbox has its own Umami website,
 * and every event is keyed by the test form's ID, so it only ever counts
 * towards `e2e-analytics-check`.
 *
 * Counts are compared to a baseline rather than to zero, so a re-run on the
 * same day still proves THIS run's events arrived. The funnel rows used are
 * event counts (not distinct visitors), so one run always adds one to each.
 *
 * Required env:
 *   SMOKE_BASE_URL     forms base URL (shared smoke convention)
 *   PREVIEW_TOKEN      the API's RECIPE_PREVIEW_TOKEN — the test form is preview
 *   E2E_ANALYTICS_URL  analytics dashboard base URL
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  openSmokeForm,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "e2e-analytics-check";

// Every event the walk below must send, in the `<formId>:<event>` form Umami
// stores and the dashboard queries (all fit Umami's 50-char name limit).
const EXPECTED_EVENTS = [
  "form-start",
  "form-step-view",
  "form-step-one",
  "form-review",
  "form-submit",
  "form-confirmation-view",
].map((event) => `${FORM_ID}:${event}`);

// The dashboard funnel rows this run must move.
const FUNNEL_STAGES = ["Start", "Review", "Submit", "Confirmation"] as const;
type FunnelCounts = Record<(typeof FUNNEL_STAGES)[number], number>;

// Umami ingest plus the dashboard's 60s cache. Generous because this runs
// nightly off the deploy path, where waiting costs nothing.
const DASHBOARD_TIMEOUT = 15 * 60_000;
const DASHBOARD_POLL = 30_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Journey 7 needs ${name} to be set`);
  return value;
}

interface UmamiEvent {
  name: string;
  data: Record<string, unknown>;
}

/** Record every custom event the page sends to Umami's `/api/send`. */
function captureUmamiEvents(page: Page): UmamiEvent[] {
  const events: UmamiEvent[] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (!new URL(req.url()).pathname.endsWith("/api/send")) return;
    let body: {
      type?: string;
      payload?: { name?: string; data?: Record<string, unknown> };
    } | null;
    try {
      body = req.postDataJSON();
    } catch {
      return;
    }
    // Pageviews are `type: "event"` too, but carry no name.
    if (body?.type === "event" && body.payload?.name) {
      events.push({ name: body.payload.name, data: body.payload.data ?? {} });
    }
  });
  return events;
}

async function readFunnel(
  page: Page,
  dashboardUrl: string,
): Promise<FunnelCounts> {
  await page.goto(dashboardUrl);
  await expect(page.getByText(FORM_ID).first()).toBeVisible({
    timeout: STEP_TIMEOUT,
  });
  const funnel = page
    .locator("section")
    .filter({ has: page.getByText("Funnel", { exact: true }) });
  const counts = {} as FunnelCounts;
  for (const stage of FUNNEL_STAGES) {
    // Each row is: label, bar, count.
    const row = funnel.getByText(stage, { exact: true }).locator("xpath=..");
    const text = await row.locator("span").last().innerText({
      timeout: STEP_TIMEOUT,
    });
    counts[stage] = Number(text.replace(/[^\d]/g, ""));
    // A markup change must fail loudly: NaN would compare as "went up".
    expect(text, `dashboard "${stage}" count`).toMatch(/\d/);
  }
  return counts;
}

test.describe("Journey 7 — forms analytics reach Umami and the dashboard", () => {
  test("events are sent, then shown on the analytics dashboard", async ({
    page,
    context,
  }) => {
    test.setTimeout(DASHBOARD_TIMEOUT + 3 * 60_000);
    required("PREVIEW_TOKEN");
    const dashboardUrl = `${required("E2E_ANALYTICS_URL").replace(/\/+$/, "")}/analytics/forms/${FORM_ID}?range=today`;

    // Baseline on its own page so the form page captures only its own events.
    const dashboard = await context.newPage();
    const before = await test.step("read the dashboard baseline", () =>
      readFunnel(dashboard, dashboardUrl));

    const events = captureUmamiEvents(page);

    await test.step("walk and submit the test form", async () => {
      await openSmokeForm(page, FORM_ID);
      await page.waitForURL((url) => !!url.searchParams.get("step"), {
        timeout: STEP_TIMEOUT,
      });

      // Fail closed with the likely cause: forms only loads Umami when
      // VITE_UMAMI_WEBSITE_ID is baked into the build.
      await expect
        .poll(
          () =>
            page.evaluate(() => typeof (window as { umami?: unknown }).umami),
          {
            message:
              "Umami never loaded on this forms deployment — is VITE_UMAMI_WEBSITE_ID set?",
            timeout: STEP_TIMEOUT,
          },
        )
        .toBe("object");

      let step = expectStep(page, "details", { exact: true });
      await fillField(page, step, "first-name", "Journey");
      await advance(page, step);

      if (currentStep(page).includes("check-your-answers")) {
        await advance(page, "check-your-answers");
      }

      step = expectStep(page, "declaration", { exact: true });
      await page
        .locator(`fieldset[id="${step}_declaration-confirmed"]`)
        .getByRole("checkbox")
        .check();

      await submitAndConfirm(page, { heading: "Application submitted" });
    });

    await test.step("the expected Umami events were sent", async () => {
      // form-confirmation-view fires on render, after the confirmation URL.
      await expect
        .poll(() => events.map((e) => e.name), { timeout: STEP_TIMEOUT })
        .toEqual(expect.arrayContaining(EXPECTED_EVENTS));
      for (const event of events.filter((e) =>
        EXPECTED_EVENTS.includes(e.name),
      )) {
        expect(event.data.form, `${event.name} should carry the form ID`).toBe(
          FORM_ID,
        );
      }
    });

    await test.step("the dashboard shows the new events", async () => {
      await expect
        .poll(
          async () => {
            const now = await readFunnel(dashboard, dashboardUrl);
            return FUNNEL_STAGES.filter((s) => now[s] <= before[s]);
          },
          {
            message:
              "dashboard funnel stages that never went up (baseline " +
              JSON.stringify(before) +
              ") — is the dashboard reading sandbox's Umami website?",
            timeout: DASHBOARD_TIMEOUT,
            intervals: [DASHBOARD_POLL],
          },
        )
        .toEqual([]);
    });
  });
});
