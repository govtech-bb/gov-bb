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

const assets = new Map();

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
      (["document", "script", "stylesheet", "image", "font"].includes(request.resourceType()) ||
        url.pathname.startsWith("/cms-preview/"))
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

page.on("response", (response) => {
  const url = new URL(response.url());

  if (url.pathname.startsWith("/cms-preview/"))
    assets.set(url.pathname, {
      origin: url.origin,
      status: response.status(),
      type: response.headers()["content-type"],
      cache: response.headers()["cache-control"],
    });
});

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const introduction = page.getByRole("textbox", { name: "Introduction", exact: true });

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
      if (!image.naturalWidth || new URL(image.src).origin !== location.origin)
        throw new Error("Site preview image is missing or depends on another origin");
    }
  });

  for (const [path, mime] of [
    ["/cms-preview/renderer.js", /(?:java|ecma)script/],
    ["/cms-preview/styles.css", /^text\/css/],
  ]) {
    const asset = assets.get(path);
    assert.ok(asset, `${path} was loaded`);
    assert.equal(asset.origin, origin);
    assert.equal(asset.status, 200);
    assert.match(asset.type, mime);
    assert.match(asset.cache, /no-cache/, `${path} must revalidate with the editor release`);
  }

  assert.equal(page.url(), url);
  assert.equal(await page.locator("iframe").count(), 0);
  await preview.getByRole("link", { name: "Help us improve alpha.gov.bb" }).click();
  assert.equal(page.url(), url, "preview actions cannot navigate");
  await button("Edit content").click();
  await introduction.fill("Written in preview, not saved.");
  assert.equal(await page.locator('[contenteditable="true"]').count(), 1);
  await button("Close preview").click();
  assert.equal(await title.inputValue(), "Unsaved preview smoke title");
  assert.equal(await introduction.inputValue(), "Written in preview, not saved.");
  assert.equal(
    await button("Preview page").evaluate((element) => element === document.activeElement),
    true,
  );
  assert.equal(await page.locator("style[data-cms-preview-styles]").count(), 0);
  await button("Undo").click();
  assert.equal(await introduction.inputValue(), "");
  assert.equal(await title.inputValue(), "Unsaved preview smoke title");
  await button("Undo").click();
  assert.equal(await title.inputValue(), initial.title);
  assert.deepEqual(api.writes, []);
  assert.deepEqual(blocked, [], "no mutation or unmocked remote request is allowed");
  assert.deepEqual(errors, []);
  console.log(
    `Site preview smoke passed at ${origin}: local assets, inline editing, undo, no writes.`,
  );
} finally {
  await browser.close();
}
