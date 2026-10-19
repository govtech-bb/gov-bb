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

const baselineKey = `govbb-editor:documents:${id}:server`;

const committedKey = `govbb-editor:documents:${id}:markdown`;

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
  body_markdown: "Original body",
  frontmatter: {},
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
};

const historical = {
  ...initial,
  title: "Historical title",
  body_markdown: "Historical body\n\n[Preview link](https://example.com/)",
  url: "/old-path",
  visibility: "public",
  parent_id: "55555555-5555-4555-8555-555555555555",
  category_id: "66666666-6666-4666-8666-666666666666",
};

let current = { ...initial };

const writes = [];

await context.route("**/*", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  const paths = [
    `/services/${service.id}`,
    `/pages/${id}`,
    `/pages/${id}/history`,
    `/pages/${id}/history/1`,
    "/taxonomy",
    "/version",
  ];

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

  if (path === "/taxonomy") return reply({ categories: [] });

  if (path === "/version") return reply({ count: 1, latest: initial.updated_at });

  if (path === `/pages/${id}/history`)
    return reply({
      versions: [
        {
          version: 2,
          action: "updated",
          actor: { id: "test-user", name: "Test employee", email: "employee@govtech.bb" },
          occurred_at: current.updated_at,
        },
        {
          version: 1,
          action: "created",
          actor: { id: "test-user", name: "Test employee", email: "employee@govtech.bb" },
          occurred_at: initial.created_at,
        },
      ],
    });

  if (path === `/pages/${id}/history/1`) return reply(historical);

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

const readBaseline = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), baselineKey);

const waitForSavedTitle = (expected) =>
  page.waitForFunction(
    ({ key, expected }) => JSON.parse(localStorage.getItem(key))?.page.title === expected,
    { key: baselineKey, expected },
  );

try {
  const url = new URL(`/services/${service.id}/${id}`, process.argv[2] ?? "http://localhost:3000/");
  await page.goto(url.href);
  await title.waitFor();
  assert.equal(await title.inputValue(), initial.title);
  assert.deepEqual((await readBaseline()).page, initial);
  assert.deepEqual(Object.keys(await readBaseline()).sort(), ["markdown", "page"]);

  await title.fill("Edited remote title");
  await body.fill("Edited remote body");
  await button("Save").click();
  await waitForSavedTitle("Edited remote title");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ifUpdatedAt, initial.updated_at);
  assert.equal(writes[0].fields.body_markdown, "Edited remote body");
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
  assert.equal((await readBaseline()).page.updated_at, savedVersion);
  assert.equal(await title.inputValue(), "My conflicting title");
  await button("Keep my version").click();
  await button("Save").click();
  await waitForSavedTitle("My conflicting title");
  assert.equal(writes.length, 3);
  assert.equal(writes[2].ifUpdatedAt, otherVersion);

  const restoreVersion = current.updated_at;
  await button("History").click();
  const dialog = page.getByRole("dialog", { name: "Version history", exact: true });
  const currentOption = dialog.getByRole("radio", { name: /^Current version/ });
  const earlierOption = dialog.getByRole("radio").nth(1);
  const restoreButton = dialog.getByRole("button", { name: "Restore this version", exact: true });
  const preview = dialog.getByRole("region", { name: "Version preview", includeHidden: true });
  await dialog.getByText("1 earlier version", { exact: true }).waitFor();
  assert.equal(await currentOption.isChecked(), true);
  assert.equal(await currentOption.evaluate((element) => element === document.activeElement), true);
  assert.equal(await restoreButton.isDisabled(), true);
  await preview.getByText("Edited remote body", { exact: true }).waitFor();

  await currentOption.press("ArrowDown");
  await preview.getByText("Historical body", { exact: true }).waitFor();
  assert.equal(await earlierOption.isChecked(), true);
  assert.equal(await restoreButton.isEnabled(), true);
  const previewLink = preview.getByRole("link", { name: "Preview link", exact: true });
  await previewLink.click();
  assert.equal(page.url(), url.href);
  await previewLink.press("Enter");
  assert.equal(page.url(), url.href);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await button("History").evaluate((element) => element === document.activeElement),
    true,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await button("History").click();
  await dialog.waitFor();
  assert.equal(await preview.isVisible(), false);
  assert.equal(await currentOption.isChecked(), true);
  await dialog.locator("label").nth(1).click();
  assert.equal(await earlierOption.isChecked(), true);
  assert.equal(await restoreButton.isEnabled(), true);
  await dialog.getByRole("button", { name: "Close version history", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await button("History").evaluate((element) => element === document.activeElement),
    true,
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("History").click();
  await dialog.locator("label").nth(1).click();
  await preview.getByText("Historical body", { exact: true }).waitFor();
  await restoreButton.click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await title.inputValue(), historical.title);
  assert.equal(writes.length, 3);
  assert.equal((await readBaseline()).page.updated_at, restoreVersion);
  await button("Undo").click();
  assert.equal(await title.inputValue(), "My conflicting title");
  assert.equal(writes.length, 3);
  await button("Redo").click();
  assert.equal(await title.inputValue(), historical.title);
  assert.equal(writes.length, 3);
  await button("Save").click();
  await waitForSavedTitle(historical.title);
  assert.equal(writes.length, 4);
  assert.equal(writes[3].ifUpdatedAt, restoreVersion);
  assert.equal(current.url, initial.url);
  assert.equal(current.parent_id, initial.parent_id);
  assert.equal(current.category_id, initial.category_id);
  assert.equal(current.visibility, initial.visibility);
  assert.equal(current.body_markdown, historical.body_markdown);

  const stored = await page.evaluate((key) => localStorage.getItem(key), committedKey);
  const baseline = await readBaseline();
  await page.reload();
  await title.waitFor();
  assert.equal(await title.inputValue(), historical.title);
  assert.equal(await body.innerText(), "Historical body\n\nPreview link");
  assert.deepEqual(await readBaseline(), baseline);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), committedKey), stored);
  assert.equal(new URL(page.url()).pathname, url.pathname);
  assert.equal(writes.length, 4);
  assert.deepEqual(errors, []);
  console.log("PASS remote page save, conflict, history restoration, storage and reload");
} finally {
  await context.close();
  await browser.close();
}
