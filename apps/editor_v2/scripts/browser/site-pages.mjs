import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authenticatedContext } from "./auth-fixture.mjs";
import { chromium } from "./playwright.mjs";

const estate = JSON.parse(
  await readFile(new URL("../../../api_v2/src/seed-data/estate.json", import.meta.url), "utf8"),
);

const originals = estate.pages
  .filter((page) => page.parent === null && page.category === null)
  .map((page, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
    version: 1,
    slug: page.url.slice(1),
    url: page.url,
    title: page.title,
    description: page.description,
    visibility: page.visibility,
    body_markdown: page.body_markdown,
    frontmatter: page.frontmatter,
    form_id: page.form_id,
    published_at: page.published_at,
    created_at: "2026-10-07T12:00:00.000Z",
    updated_at: "2026-10-07T12:00:00.000Z",
    parent_id: null,
    category_id: null,
    pending_revision: null,
    last_edited_by: null,
  }));

assert.deepEqual(originals.map((page) => page.url).sort(), [
  "/terms-conditions",
  "/what-we-mean-by-alpha",
  "/whats-changing",
]);

const working = new Map(originals.map((page) => [page.id, page]));

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

const errors = [];

const writes = [];

const serviceReads = [];

page.on("pageerror", (error) => errors.push(error.message));

await context.route("**/*", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (request.resourceType() === "document") return route.fallback();

  if (path.startsWith("/services/")) serviceReads.push(path);
  const current = working.get(path.replace("/pages/", ""));

  if (
    !current &&
    !["/editor/site-pages", "/editor/categories", "/editor/page-paths", "/version"].includes(path)
  )
    return route.fallback();

  const headers = {
    "access-control-allow-origin": request.headers().origin ?? new URL(page.url()).origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };

  const reply = (json, status = 200) => route.fulfill({ status, headers, json });

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  if (path === "/editor/site-pages")
    return reply({
      pages: originals.map(({ id, title, url, visibility }) => ({ id, title, url, visibility })),
    });

  if (path === "/editor/categories") return reply({ categories: [] });

  if (path === "/editor/page-paths") return reply(originals.map((page) => page.url));

  if (path === "/version")
    return reply({ count: originals.length, latest: originals[0].updated_at });

  if (request.method() === "GET") return reply(current);
  assert.equal(request.method(), "PUT");
  const { expected_version, ...fields } = request.postDataJSON();
  assert.equal(expected_version, current.version);
  writes.push({ id: current.id, fields });

  const saved = {
    ...current,
    ...fields,
    version: current.version + 1,
    updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
    pending_revision: { status: "draft", comment: null },
  };

  working.set(current.id, saved);

  return reply(saved);
});

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const saved = () =>
  page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();

try {
  const base = process.argv[2] ?? "http://localhost:3000/";
  await page.goto(new URL("/services", base).href);
  await page.getByRole("link", { name: "Site pages", exact: true }).press("Enter");

  for (const original of originals) {
    await page.getByRole("heading", { name: "Site pages", exact: true }).waitFor();
    await page
      .locator("main")
      .getByRole("link", { name: original.title, exact: true })
      .press("Enter");
    await title.waitFor();
    assert.equal(await title.inputValue(), original.title);
    assert.equal(await button("Save").getAttribute("aria-disabled"), "true");
    assert.equal(await button("Add document").count(), 0);

    if ((await button("Page settings").getAttribute("aria-expanded")) !== "true")
      await button("Page settings").click();
    assert.equal(await page.getByLabel("Category", { exact: true }).count(), 0);
    assert.equal(await page.getByLabel("Subcategory", { exact: true }).count(), 0);
    const editedTitle = `${original.title} updated`;
    await title.fill(editedTitle);
    await button("Save").click();
    await saved();
    assert.deepEqual(writes.at(-1), {
      id: original.id,
      fields: {
        title: editedTitle,
        url: original.url,
        category_id: null,
        visibility: original.visibility,
        description: original.description,
        form_id: original.form_id,
        frontmatter: original.frontmatter,
        body_markdown: original.body_markdown,
      },
    });
    await page
      .getByText("Your changes are saved but not live.", { exact: false })
      .filter({ visible: true })
      .waitFor();
    assert.equal(await button("Submit for review").isVisible(), true);
    const editedBody = `Updated site information for ${original.url}.`;
    await body.fill(editedBody);
    await button("Save").click();
    await saved();
    assert.equal(writes.at(-1).fields.body_markdown, editedBody);
    await page.reload();
    await title.waitFor();
    assert.equal(await title.inputValue(), editedTitle);
    assert.equal(await body.innerText(), editedBody);
    assert.equal(await button("Save").getAttribute("aria-disabled"), "true");
    assert.equal(working.get(original.id).parent_id, null);
    assert.equal(working.get(original.id).published_at, original.published_at);
    assert.equal(working.get(original.id).visibility, "public");

    await title.fill("Unsaved title");
    await page.locator("header").getByRole("link", { name: "Site pages", exact: true }).click();
    const leave = page.getByRole("alertdialog");
    await leave.waitFor();
    await leave.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await title.inputValue(), "Unsaved title");
    await page.locator("header").getByRole("link", { name: "Site pages", exact: true }).click();
    await leave.getByRole("button", { name: "Leave without saving", exact: true }).click();
  }

  await page.getByRole("heading", { name: "Site pages", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await button("Menu").click();
  await page
    .getByRole("navigation", { name: "Menu", exact: true })
    .getByRole("link", { name: "Site pages", exact: true })
    .click();
  await page.locator("main").getByRole("link", { name: originals[0].title, exact: true }).click();
  await title.waitFor();
  assert.equal(await button("Save").isVisible(), true);
  assert.equal(
    await page.getByRole("link", { name: "Page history", exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  assert.equal(writes.length, 6);
  assert.deepEqual(serviceReads, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS site pages: all three seeded bodies, details-only preservation, save/reload, review notices, leave guard, keyboard and mobile navigation",
  );
} finally {
  await browser.close();
}
