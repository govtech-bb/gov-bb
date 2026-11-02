import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixturePage, installPageApi } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, {
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});

// Warning navigation must work even while preview assets are unavailable.
await context.route("**/cms-preview/**", (route) => route.abort());

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const service = servicesFixture[0];

const id = "44444444-4444-4444-8444-444444444444";

const initial = fixturePage(id, {
  parent_id: service.id,
  url: `${service.url}/guidance`,
  title: "Check page links",
  visibility: "preview",
  body_markdown: [
    "Read [Fees information](/missing-fees).",
    "",
    "1. Apply online",
    "",
    '   <a data-start-link href="/missing-start">Start application</a>',
    "",
    "2. Apply in person",
    "",
    `[Existing service](${service.url}), [section](#apply), [external](https://example.com/).`,
  ].join("\n"),
  pending_revision: null,
});

const api = await installPageApi(context, service, [initial]);

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const content = page.getByRole("textbox", { name: "Page content", exact: true });

try {
  await page.goto(
    new URL(`/services/${service.id}/${id}`, process.argv[2] ?? "http://localhost:3186/").href,
  );
  await title.waitFor();
  await button("Fees information").waitFor();
  assert.equal(await button("Existing service").count(), 0);
  assert.equal(await button("section").count(), 0);
  assert.equal(await button("external").count(), 0);

  for (const label of ["Fees information", "Start application"]) {
    await button(label).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction((expected) => {
      const selection = window.getSelection();
      const selected = selection?.anchorNode?.parentElement;

      return (
        document.activeElement?.getAttribute("aria-label") === "Page content" &&
        selected?.closest("a, [data-page-component='start']")?.textContent === expected
      );
    }, label);
  }

  await button("Preview page").click();
  await button("Close preview").waitFor();
  await button("Start application").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const selected = window.getSelection()?.anchorNode?.parentElement;

    return (
      document.activeElement?.getAttribute("aria-label") === "Page content" &&
      selected?.closest("[data-page-component='start']")?.textContent === "Start application"
    );
  });
  assert.equal(await button("Close preview").count(), 0);

  await title.fill("Saved with a warning");
  let releasePaths;

  const pathsReady = new Promise((resolve) => {
    releasePaths = resolve;
  });

  const delayPaths = async (route) => {
    await pathsReady;
    await route.fallback();
  };

  await context.route("**/editor/page-paths", delayPaths);

  const checking = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/editor/page-paths",
  );

  await button("Save").click();
  await checking;
  assert.equal(api.writes.length, 0);
  releasePaths();
  await page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();
  await context.unroute("**/editor/page-paths", delayPaths);
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].fields.visibility, "preview");
  assert.equal(await page.getByRole("alertdialog").count(), 0);

  const settings = button("Page settings");

  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("");
  await button("Publish changes").click();
  const confirm = page.getByRole("alertdialog");
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /Fees information/);
  assert.equal(api.writes.length, 1);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(api.writes.length, 1);

  await button("Publish changes").click();
  await confirm.waitFor();
  await confirm.getByRole("button", { name: /publish/i }).click();
  await confirm.waitFor({ state: "hidden" });
  await page
    .locator("[data-document-bar]:visible")
    .getByText("Published", { exact: true })
    .waitFor();
  assert.equal(api.writes.length, 2);
  assert.equal(api.writes[1].fields.visibility, "public");

  await page.setViewportSize({ width: 390, height: 844 });
  await button("Fees information").waitFor();
  assert.ok((await button("Fees information").boundingBox()).height >= 44);
  assert.equal(await content.count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "/tmp/3186-link-warnings-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/3186-link-warnings-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Link warnings: keyboard focus, preview save, publish confirmation and mobile layout passed.",
  );
} finally {
  await browser.close();
}
