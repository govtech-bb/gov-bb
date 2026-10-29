import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const service = servicesFixture[0];

const id = "44444444-4444-4444-8444-444444444444";

await page.addInitScript((id) => {
  localStorage.setItem("govbb-editor:workspace:v1", "{broken old workspace");
  localStorage.setItem(`govbb-editor:documents:${id}:markdown`, "Conflicting local page");
  localStorage.setItem(`govbb-editor:documents:${id}:server`, "{malformed baseline");
  localStorage.setItem("govbb-editor:draft:replacement", "{unfinished old replacement");
  window.draftStorageCalls = [];

  for (const method of ["getItem", "setItem", "removeItem", "clear"]) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (...args) {
      if (method === "clear" || /govbb-editor:(documents:|draft:|workspace:)/.test(args[0]))
        window.draftStorageCalls.push([method, ...args]);

      return original.apply(this, args);
    };
  }
}, id);

const initial = {
  id,
  parent_id: service.id,
  category_id: null,
  url: `${service.url}/supporting`,
  slug: "supporting",
  title: "Remote supporting page",
  description: "Supporting description",
  visibility: "draft",
  form_id: null,
  body_markdown: "Original body\n\n[Preview link](https://example.com/)",
  frontmatter: {},
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
};

let current = { ...initial };

const writes = [];

const historyRequests = [];

page.on("request", (request) => {
  if (/^\/pages\/[^/]+\/history(?:\/|$)/.test(new URL(request.url()).pathname))
    historyRequests.push(request.url());
});

await context.route("**/*", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  const paths = [`/services/${service.id}`, `/pages/${id}`, "/editor/categories", "/version"];

  if (!paths.includes(path) || request.resourceType() === "document") return route.fallback();

  const headers = {
    "access-control-allow-origin": request.headers().origin ?? new URL(page.url()).origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, if-updated-at",
    "cache-control": "no-store",
  };

  const reply = (json, status = 200) => route.fulfill({ status, headers, json });

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  if (path === `/services/${service.id}`)
    return reply({ service, pages: [{ ...current, role: "supporting" }] });

  if (path === "/editor/categories") return reply({ categories: [] });

  if (path === "/version") return reply({ count: 1, latest: initial.updated_at });

  if (request.method() === "GET") return reply(current);

  assert.equal(request.method(), "PUT");
  const fields = request.postDataJSON();
  const ifUpdatedAt = request.headers()["if-updated-at"];
  writes.push({ fields, ifUpdatedAt });

  if (ifUpdatedAt !== current.updated_at) return reply({ error: "conflict" }, 409);
  current = {
    ...current,
    ...fields,
    updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
  };

  return reply(current);
});

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const visibility = page.getByRole("combobox", { name: "Visibility", exact: true });

const waitForSavedTitle = async (expected) => {
  await page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();
  assert.equal(current.title, expected);
};

try {
  const url = new URL(`/services/${service.id}/${id}`, process.argv[2] ?? "http://localhost:3000/");
  await page.goto(url.href);
  await title.waitFor();
  assert.equal(await title.inputValue(), initial.title);
  assert.deepEqual(await page.evaluate(() => window.draftStorageCalls), []);
  assert.equal(await button("History").count(), 0);

  await button("Preview page").click();

  const previewLink = page.locator("[data-cms-preview-article]").getByRole("link", {
    name: "Preview link",
    exact: true,
  });

  await previewLink.click();
  assert.equal(page.url(), url.href);
  await previewLink.press("Enter");
  assert.equal(page.url(), url.href);
  await button("Close preview").click();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await button("History").count(), 0);
  assert.equal(await button("Preview page").isVisible(), true);
  assert.equal(await button("Save").isVisible(), true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await title.fill("Edited remote title");
  await button("Undo").click();
  assert.equal(await title.inputValue(), initial.title);
  await button("Redo").click();
  assert.equal(await title.inputValue(), "Edited remote title");
  assert.equal(writes.length, 0);
  const settingsToggle = button("Page settings");

  if ((await settingsToggle.getAttribute("aria-expanded")) !== "true") await settingsToggle.click();
  assert.equal(await visibility.inputValue(), "draft");
  assert.equal(await visibility.locator('option[value="draft"]').isDisabled(), true);

  for (const value of ["", "preview"]) {
    await visibility.selectOption(value);
    assert.equal(await visibility.locator('option[value="draft"]').isEnabled(), true);
    const laterTitle = `Edited remote title (${value || "public"})`;
    const laterBody = `Edited remote body (${value || "public"})`;
    await title.fill(laterTitle);
    await body.fill(laterBody);
    await visibility.focus();
    await visibility.press("d");
    assert.equal(await visibility.inputValue(), "draft");
    assert.equal(await title.inputValue(), laterTitle);
    assert.equal(await body.innerText(), laterBody);
    await button("Undo").click();
    assert.equal(await visibility.inputValue(), value);
    assert.equal(await title.inputValue(), laterTitle);
    assert.equal(await body.innerText(), laterBody);
    await button("Redo").click();
    assert.equal(await visibility.inputValue(), "draft");
    assert.equal(writes.length, 0);
    assert.equal(current.visibility, "draft");
    assert.equal(current.title, initial.title);
  }

  const savedTitle = await title.inputValue();
  const savedBody = await body.innerText();
  await button("Save").click();
  await waitForSavedTitle(savedTitle);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ifUpdatedAt, initial.updated_at);
  assert.equal(writes[0].fields.body_markdown, savedBody);
  assert.equal(writes[0].fields.url, initial.url);
  assert.equal(writes[0].fields.visibility, "draft");
  assert.equal(Object.hasOwn(writes[0].fields, "parent_id"), false);

  const savedVersion = current.updated_at;
  current = {
    ...current,
    title: "Changed by another employee",
    updated_at: "2026-10-07T13:00:00.000Z",
  };
  const otherVersion = current.updated_at;
  await title.fill("My conflicting title");
  await button("Save").click();
  // Shown under the bar, and read out by the page's save state
  await page
    .getByText("A newer version of this page has been saved since you opened it.")
    .first()
    .waitFor();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].ifUpdatedAt, savedVersion);
  assert.equal(await title.inputValue(), "My conflicting title");
  await button("Keep my version").click();
  await button("Save").click();
  await waitForSavedTitle("My conflicting title");
  assert.equal(writes.length, 3);
  assert.equal(writes[2].ifUpdatedAt, otherVersion);

  assert.deepEqual(await page.evaluate(() => window.draftStorageCalls), []);
  await page.reload();
  await title.waitFor();
  assert.equal(await title.inputValue(), "My conflicting title");
  assert.equal(await body.innerText(), savedBody);
  assert.deepEqual(await page.evaluate(() => window.draftStorageCalls), []);
  assert.equal(
    await page.evaluate((id) => localStorage[`govbb-editor:documents:${id}:markdown`], id),
    "Conflicting local page",
  );
  assert.equal(new URL(page.url()).pathname, url.pathname);
  assert.equal(writes.length, 3);

  if ((await settingsToggle.getAttribute("aria-expanded")) !== "true") await settingsToggle.click();
  await visibility.selectOption("");
  assert.equal(await visibility.locator('option[value="draft"]').isEnabled(), true);
  assert.equal(writes.length, 3);
  await button("Publish changes").click();
  await page
    .locator("[data-document-bar]:visible")
    .getByText("Published", { exact: true })
    .waitFor();
  assert.equal(writes.length, 4);
  assert.equal(writes[3].fields.visibility, "public");
  assert.equal(current.visibility, "public");
  assert.equal(await visibility.locator('option[value="draft"]').count(), 0);
  await button("Undo").click();
  assert.equal(await visibility.inputValue(), "draft");
  assert.equal(await visibility.locator('option[value="draft"]').isDisabled(), true);
  await button("Redo").click();
  assert.equal(await visibility.inputValue(), "");
  assert.equal(await visibility.locator('option[value="draft"]').count(), 0);
  assert.equal(writes.length, 4);
  assert.equal(await button("History").count(), 0);
  assert.deepEqual(historyRequests, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS remote page save, legacy Draft restoration, explicit publication, conflict, undo/redo, safe preview, no history, inert old drafts and API reload",
  );
} finally {
  await context.close();
  await browser.close();
}
