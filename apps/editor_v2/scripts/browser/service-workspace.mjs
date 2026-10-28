import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixturePage, installPageApi } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const page = await context.newPage(),
  errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const base = new URL(process.argv[2] ?? "http://localhost:3000/");

const service = servicesFixture[0];

const api = await installPageApi(context, service, [
  fixturePage(service.id, { title: service.title, url: service.url }),
]);

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

try {
  await page.addInitScript(() => {
    localStorage.setItem("govbb-editor:workspace:v1", "{malformed old workspace");
    localStorage.setItem("govbb-editor:draft:markdown:v2", "Old browser-only form");
  });
  const firstRead = Promise.withResolvers();
  await context.route("**/services", async (route) => {
    if (route.request().resourceType() !== "document" && route.request().method() === "GET")
      await firstRead.promise;

    return route.fallback();
  });
  await page.goto(new URL("/services", base).href);
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  await page.getByRole("status").filter({ hasText: "Loading services…" }).waitFor();
  assert.equal(await button("Sign out").isVisible(), true);
  assert.equal(await page.getByRole("searchbox").isVisible(), true);
  const header = await page.locator("header").elementHandle();
  firstRead.resolve();
  await page
    .getByRole("status")
    .filter({ hasText: "Loading services…" })
    .waitFor({ state: "hidden" });
  assert.equal(
    await header.evaluate((element) => element.isConnected),
    true,
    "loading does not remount the shell",
  );
  assert.equal(await button("Create browser draft").count(), 0);
  assert.equal(await page.getByText("Drafts in this browser", { exact: true }).count(), 0);

  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Draft (hidden)", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByRole("link", { name: servicesFixture[2].title, exact: true }).isVisible(),
    true,
  );
  assert.equal(await page.getByRole("link", { name: service.title, exact: true }).count(), 0);
  await button("Clear filters").click();
  await page.getByRole("link", { name: service.title, exact: true }).waitFor();

  const detailRead = Promise.withResolvers();
  const pageRead = Promise.withResolvers();
  const taxonomyRead = Promise.withResolvers();

  for (const [path, held] of [
    [`/services/${service.id}`, detailRead],
    [`/pages/${service.id}`, pageRead],
    ["/taxonomy", taxonomyRead],
  ]) {
    await context.route(`**${path}`, async (route) => {
      if (route.request().resourceType() !== "document" && route.request().method() === "GET")
        await held.promise;

      return route.fallback();
    });
  }

  await page.getByRole("link", { name: service.title, exact: true }).click();
  const pageLoading = page.getByRole("status").filter({ hasText: "Loading page…" });
  await pageLoading.waitFor();
  assert.equal(await header.evaluate((element) => element.isConnected), true);

  const detailResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/services/${service.id}` &&
      response.request().resourceType() !== "document",
  );

  detailRead.resolve();
  await detailResponse;

  const documentResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/pages/${service.id}`,
  );

  pageRead.resolve();
  await documentResponse;
  await pageLoading.waitFor();
  assert.equal(
    await title.count(),
    0,
    "taxonomy required for the initial document has not arrived",
  );
  taxonomyRead.resolve();
  await title.waitFor();
  assert.equal(await title.inputValue(), service.title);
  assert.equal(await header.evaluate((element) => element.isConnected), true);
  await page.locator("header").getByRole("link", { name: "Services", exact: true }).click();
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("status").filter({ hasText: "Loading services…" }).count(),
    0,
    "cached navigation does not add a loader",
  );

  await button("Create service").click();
  const create = page.getByRole("dialog", { name: "Create a service", exact: true });
  await create
    .getByText(
      "The service starts in Preview. Add its start page and supporting pages once it exists.",
      { exact: true },
    )
    .waitFor();
  await create.getByLabel("Service name", { exact: true }).fill("API workspace checks");
  await create.getByLabel("Category", { exact: true }).selectOption("category-1");
  await create.getByRole("button", { name: "Create service", exact: true }).click();
  await title.waitFor();
  assert.equal(await title.inputValue(), "API workspace checks");
  const created = api.writes.find((write) => write.method === "POST");
  assert.equal(created.fields.visibility, "preview");
  assert.equal(created.fields.body_markdown, "");
  assert.equal(created.fields.category_id, "category-1");
  assert.equal(new URL(page.url()).pathname, `/services/${created.id}/${created.id}`);
  assert.equal(await page.getByRole("link", { name: "Application form", exact: true }).count(), 0);

  await button("Add document").click();
  const add = page.getByRole("dialog", { name: "Add a page", exact: true });
  await add
    .getByText("The page starts in Preview beneath this service's entry page.", { exact: true })
    .waitFor();
  assert.deepEqual(await add.getByLabel("Document type").locator("option").allTextContents(), [
    "Start page",
    "Supporting page",
  ]);
  assert.equal(await add.locator('input[type="file"]').count(), 0);
  await add.getByRole("button", { name: "Add page", exact: true }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('textarea[aria-label="Page title"]')].some(
      (input) => !input.closest("[hidden]") && input.value === "Before you start",
    ),
  );
  const start = api.writes.filter((write) => write.method === "POST").at(-1);
  assert.equal(start.fields.parent_id, created.id);
  assert.equal(start.fields.url, `${created.fields.url}/start`);
  assert.equal(start.fields.visibility, "preview");
  assert.equal(start.fields.body_markdown, "");

  await button("Add document").click();
  await add.getByLabel("Document type").selectOption("supporting");
  await add.getByLabel("Page title", { exact: true }).fill("Fees");
  await add.getByRole("button", { name: "Add page", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Page title"]')?.value === "Fees" ||
      [...document.querySelectorAll('textarea[aria-label="Page title"]')].some(
        (input) => !input.closest("[hidden]") && input.value === "Fees",
      ),
  );
  const child = api.writes.filter((write) => write.method === "POST").at(-1);
  assert.equal(child.fields.parent_id, created.id);
  assert.equal(child.fields.visibility, "preview");
  assert.equal(child.fields.body_markdown, "");
  assert.equal(child.fields.url, `${created.fields.url}/fees`);
  await page.getByLabel("Form ID", { exact: true }).fill("externally-managed-form");
  assert.equal(api.writes.filter((write) => write.method === "PUT").length, 0);
  await button("Save").click();
  await page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();
  assert.equal(api.pages.get(child.id).form_id, "externally-managed-form");
  await button("Preview page").click();
  await page.locator("[data-cms-preview-article]").waitFor();
  await button("Close preview").click();

  await button("Delete page").click();
  const question = page.getByRole("alertdialog");
  await question.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(api.pages.has(child.id), true);
  await button("Delete page").click();
  await question.getByRole("button", { name: "Delete page", exact: true }).click();
  await page.waitForURL(new URL(`/services/${created.id}/${created.id}`, base).href);
  assert.equal(api.pages.has(child.id), false);
  assert.equal(api.writes.filter((write) => write.method === "DELETE").length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.goto(new URL("/services/old-local-service/form-original", base).href);
  await page.getByRole("heading", { name: "Document not found" }).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage["govbb-editor:workspace:v1"]),
    "{malformed old workspace",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS API service/page creation, explicit save, form-id metadata, preview, deletion, inert local workspace, not-found handling and mobile",
  );
} finally {
  await browser.close();
}
