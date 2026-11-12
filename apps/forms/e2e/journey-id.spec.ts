/**
 * journey-id.spec.ts
 *
 * Landing's Start click and the form's `form-start` share one journey_id, so a
 * journey can be joined across the two sites (#3506).
 *
 * The two sites are on different origins, so the forms app can't read the ID
 * from landing's sessionStorage: the Start link carries it as ?jid=, and the
 * forms app adopts it on boot and strips it from the address bar.
 *
 * Landing is stood in for by a page on its own origin (so it has its own
 * sessionStorage). It runs the real @govtech-bb/analytics code, which the forms
 * dev server serves from source, and tags its Start link as landing's
 * StartLink does. StartLink's own click handler is covered by
 * apps/landing/src/components/markdown/StartLink.test.tsx.
 *
 * Needs the dev server started with VITE_JOURNEY_URL (playwright.config.ts
 * sets it); a dev server you started yourself without it sends no events.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./helpers/api-mock";

const LANDING = "https://landing.test";
const JOURNEY_PATH = "/__e2e-journey";
const ANALYTICS_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/analytics/src/index.ts",
);

type JourneyEvent = Record<string, unknown>;

test("landing's Start click and form-start share one journey_id", async ({
  page,
  baseURL,
}) => {
  const formsOrigin = new URL(baseURL!).origin;

  const events: JourneyEvent[] = [];
  await page.route(`**${JOURNEY_PATH}`, async (route) => {
    events.push(...(JSON.parse(route.request().postData() ?? "[]") as []));
    await route.fulfill({ status: 204 });
  });
  await page.route(`${LANDING}/**`, async (route) => {
    const url = route.request().url();
    if (new URL(url).pathname !== "/start") {
      // The analytics modules: fetched from the forms dev server.
      const response = await route.fetch({
        url: url.replace(LANDING, formsOrigin),
      });
      return route.fulfill({ response });
    }
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Start</title>
<a href="${formsOrigin}/forms/master" data-umami-event="start-click"
   data-umami-event-form-id="master">Start now</a>
<script type="module">
  import {
    configureJourney,
    flushJourney,
    installClickListener,
    withJourneyId,
  } from "/@fs${ANALYTICS_SRC}";
  configureJourney({ url: "${formsOrigin}${JOURNEY_PATH}", app: "landing" });
  installClickListener();
  const start = document.querySelector("a");
  start.addEventListener("click", () => {
    start.href = withJourneyId(start.href);
    // Landing sends its queue on pagehide, but Playwright never sees a beacon
    // sent while a page unloads, so send it now.
    flushJourney();
  });
  document.title = "Ready";
</script>`,
    });
  });

  await page.goto(`${LANDING}/start`);
  await expect(page).toHaveTitle("Ready");
  await page.getByRole("link", { name: "Start now" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const formsUrl = new URL(page.url());
  expect(formsUrl.origin).toBe(formsOrigin);
  expect(formsUrl.pathname).toBe("/forms/master");
  // jid is gone from the address bar once the forms app has loaded.
  expect(formsUrl.searchParams.has("jid")).toBe(false);

  // Send the forms app's queued events now rather than after its 5s delay.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const find = (app: string, event: string) =>
    events.find((e) => e.app === app && e.event === event);
  await expect
    .poll(() => find("forms", "form-start"), {
      message:
        "no form-start journey event: is the dev server running with VITE_JOURNEY_URL set?",
    })
    .toBeTruthy();

  const click = find("landing", "start-click");
  const formStart = find("forms", "form-start");
  expect(click?.journey_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(formStart?.journey_id).toBe(click?.journey_id);
  // Two page loads on two sites, one journey.
  expect(formStart?.page_load_id).not.toBe(click?.page_load_id);

  // jid never reaches a logged path.
  for (const e of events) expect(String(e.path)).not.toContain("jid");
});
