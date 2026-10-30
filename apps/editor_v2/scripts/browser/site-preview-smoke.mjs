import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixturePage, installPageApi } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

// Safe against deployed editors: only static assets reach the network, never API reads or writes.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3060").origin;

const service = servicesFixture[0];

const initial = fixturePage(service.id, {
  title: service.title,
  url: service.url,
  body_markdown:
    "Working copy content.\n\n:::details[Preview guidance]\nBring identification.\n:::\n",
});

const browser = await chromium.launch();

const context = await authenticatedContext(browser, {
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
});

const api = await installPageApi(context, service, [initial]);

const blocked = [];

const errors = [];

const fixturePaths = new Set([
  "/api/auth/get-session",
  "/editor/me",
  "/editor/categories",
  "/services",
  `/services/${service.id}`,
  `/pages/${service.id}`,
  "/version",
]);

// Registered last so even mutations understood by a fixture are refused before it sees them.
await context.route("**/*", (route) => {
  const request = route.request();
  const url = new URL(request.url());

  if (["GET", "HEAD", "OPTIONS"].includes(request.method())) {
    if (request.resourceType() !== "document" && fixturePaths.has(url.pathname))
      return route.fallback();

    if (
      url.origin === origin &&
      request.method() !== "OPTIONS" &&
      !url.pathname.startsWith("/cms-preview/") &&
      ["document", "script", "stylesheet", "image", "font"].includes(request.resourceType())
    )
      return route.continue();
  }

  blocked.push(`${request.method()} ${url.origin}${url.pathname}`);

  return route.abort("blockedbyclient");
});

const page = await context.newPage();

page.setDefaultTimeout(15_000);

page.on("pageerror", (error) => errors.push(error.message));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const preview = page.locator("[data-cms-site-preview]");

const problem = page.getByText(/Your working copy is unchanged/);

try {
  const url = `${origin}/services/${service.id}/${service.id}`;
  await page.goto(url);
  await title.fill("Unsaved preview smoke title");
  await button("Preview page").click();
  await preview.or(problem).first().waitFor();
  assert.deepEqual(await problem.allTextContents(), [], "preview must open without configuration");
  assert.equal(await preview.locator("h1").innerText(), "Unsaved preview smoke title");
  assert.equal(await preview.locator("header").count(), 1);
  assert.equal(await preview.locator("footer").count(), 1);
  await preview.getByText("Preview guidance", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await preview.locator("img").evaluateAll(async (images) => {
    if (!images.length) throw new Error("Site preview branding images are missing");
    await Promise.all(images.map((image) => image.decode()));

    for (const image of images) {
      if (
        !image.naturalWidth ||
        (!image.src.startsWith("data:image/") && new URL(image.src).origin !== location.origin)
      )
        throw new Error("Site preview image is missing or depends on another origin");
    }
  });

  assert.equal(page.url(), url);
  assert.equal(await page.locator("iframe").count(), 0);
  await button("Close preview").click();
  assert.equal(await title.inputValue(), "Unsaved preview smoke title");
  assert.equal(page.url(), url);
  assert.deepEqual(api.writes, []);
  assert.deepEqual(blocked, [], "no mutation or unmocked remote request is allowed");
  assert.deepEqual(errors, []);
  console.log(
    `Site preview smoke passed at ${origin}: local template, unsaved content intact, no writes.`,
  );
} finally {
  await browser.close();
}
