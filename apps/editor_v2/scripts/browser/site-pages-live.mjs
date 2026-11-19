import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

// Opt-in, against a real api_v2 and its database: nothing here is intercepted. Set up as for categories-live.mjs,
// but start api_v2 with SEED=true over a fresh disposable database, so it holds the estate's three site pages as
// seeded. Every run leaves a pending revision on each of them, so run it once per database.
//
//   node scripts/browser/site-pages-live.mjs http://localhost:43108/ [api-origin] [screenshot-dir]

const [baseURL, apiOrigin = "http://127.0.0.1:43107", shots = "/tmp/site-pages-live"] =
  process.argv.slice(2);

if (!baseURL) {
  console.error(
    "Usage: node scripts/browser/site-pages-live.mjs <editor-url> [api-origin] [screenshot-dir]",
  );
  process.exit(2);
}

/** A read straight from api_v2: as the bypass's developer for editor routes, as the public for the site's. */
const read = async (path) => {
  const response = await fetch(new URL(path, apiOrigin));
  assert.equal(response.status, 200, path);

  return response.json();
};

const sitePath = (url) => `/pages?url=${encodeURIComponent(url)}`;

const { pages: listed } = await read("/editor/site-pages");

assert.deepEqual(listed.map((page) => page.url).sort(), [
  "/terms-conditions",
  "/what-we-mean-by-alpha",
  "/whats-changing",
]);

const services = await read("/services");

assert.equal(
  services.some((service) => listed.some((page) => page.url === service.url)),
  false,
);

const originals = await Promise.all(
  listed.map(async ({ id, url }) => ({
    page: await read(`/pages/${id}`),
    site: await read(sitePath(url)),
  })),
);

for (const { page } of originals)
  assert.equal(
    page.pending_revision,
    null,
    `${page.url} has a revision already: use a fresh database`,
  );

// Each run's own words, so a reload can only show what this run saved
const run = Date.now().toString(36);

const browser = await chromium.launch();

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const saved = () =>
  page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();

const fitsWidth = () =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Types at the very end of the page's last text, wherever its last line wraps, whatever the platform's keys. */
const typeAtEnd = async (text) => {
  await body.focus();
  await body.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last = null;

    while (walker.nextNode()) last = walker.currentNode;
    getSelection().collapse(last, last.length);
  });
  // The editor takes up the selection from selectionchange, a task after this one
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.keyboard.type(text);
};

/** What a save must leave alone: everything but the fields it changes, and the version stamps. */
const unchanged = (before, after, changed) => {
  for (const key of Object.keys(before))
    if (![...changed, "version", "updated_at", "pending_revision"].includes(key))
      assert.deepEqual(after[key], before[key], `${before.url}: ${key}`);
};

try {
  await page.goto(new URL("/services", baseURL).href);
  await page.getByRole("link", { name: "Site pages", exact: true }).press("Enter");
  await page.getByRole("heading", { name: "Site pages", exact: true }).waitFor();
  await page.screenshot({ path: `${shots}-list.png` });

  for (const { page: original, site } of originals) {
    await page.getByRole("heading", { name: "Site pages", exact: true }).waitFor();
    await page
      .locator("main")
      .getByRole("link", { name: original.title, exact: true })
      .press("Enter");
    await title.waitFor();
    assert.equal(await title.inputValue(), original.title);
    assert.equal(await button("Save").getAttribute("aria-disabled"), "true");

    if ((await button("Page settings").getAttribute("aria-expanded")) !== "true")
      await button("Page settings").click();
    assert.equal(await page.getByLabel("Category", { exact: true }).count(), 0);

    // Page details alone: the body goes back byte for byte, into a pending revision
    const description = `Checked by the live suite ${run}`;
    await page.getByLabel("Description", { exact: true }).fill(description);
    await button("Save").click();
    await saved();
    const detailed = await read(`/pages/${original.id}`);
    assert.equal(detailed.body_markdown, original.body_markdown);
    assert.equal(detailed.description, description);
    assert.deepEqual(detailed.pending_revision, { status: "draft", comment: null });
    unchanged(original, detailed, ["description"]);
    const revision = await read(`/pages/${original.id}/revision`);

    // A body change typed into the page joins the same revision
    const added = `Live check ${run} for ${original.url}.`;
    await typeAtEnd(` ${added}`);
    await button("Save").click();
    await saved();
    const edited = await read(`/pages/${original.id}`);
    assert.equal(edited.body_markdown.endsWith(` ${added}`), true);
    assert.equal(edited.version > detailed.version, true);
    unchanged(original, edited, ["description", "body_markdown"]);
    const updated = await read(`/pages/${original.id}/revision`);
    assert.equal(updated.id, revision.id);
    assert.equal(updated.status, "draft");

    // Citizens still see the live page, and the list its live title
    assert.deepEqual(await read(sitePath(original.url)), site);
    assert.deepEqual(
      (await read("/editor/site-pages")).pages.find((entry) => entry.id === original.id),
      {
        id: original.id,
        title: original.title,
        url: original.url,
        visibility: original.visibility,
      },
    );

    // A fresh editor session opens what was saved
    await page.reload();
    await title.waitFor();
    assert.equal((await body.innerText()).includes(added), true);
    assert.equal(await button("Save").getAttribute("aria-disabled"), "true");
    await page
      .getByText("Your changes are saved but not live.", { exact: false })
      .filter({ visible: true })
      .waitFor();

    await button("Preview page").click();
    await page.getByText(added).filter({ visible: true }).first().waitFor();
    await page.screenshot({ path: `${shots}-preview-${original.slug}.png` });
    await button("Close preview").click();
    await title.waitFor();

    await page.getByRole("link", { name: "Page history", exact: true }).click();
    await page.getByRole("heading", { name: `History: ${original.title}`, exact: true }).waitFor();
    await page.getByRole("link", { name: "Back to the page", exact: true }).click();
    await title.waitFor();
    assert.equal((await body.innerText()).includes(added), true);
    await page.screenshot({ path: `${shots}-page-${original.slug}.png` });
    await page.locator("header").getByRole("link", { name: "Site pages", exact: true }).click();
  }

  await page.getByRole("heading", { name: "Site pages", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await fitsWidth(), true);
  await page.screenshot({ path: `${shots}-list-390.png` });
  await page
    .locator("main")
    .getByRole("link", { name: originals[0].page.title, exact: true })
    .click();
  await title.waitFor();
  assert.equal(await fitsWidth(), true);
  await page.screenshot({ path: `${shots}-page-390.png` });
  assert.deepEqual(errors, []);
  console.log(
    `PASS site pages live: three seeded pages edited, saved into revisions and reopened; screenshots at ${shots}-*.png`,
  );
} finally {
  await browser.close();
}
