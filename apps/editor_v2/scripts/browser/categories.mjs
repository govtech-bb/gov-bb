import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixtureCategory, fixturePage, installPageApi } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

const baseURL = process.argv[2];

const service = { ...servicesFixture[0], category: { slug: "education", title: "Education" } };

const youth = fixtureCategory("youth", "youth", "Youth", { position: 2 });

const saved = [
  fixtureCategory("education", "education", "Education", { services: 1 }),
  fixtureCategory("health", "health", "Health", { position: 1 }),
  youth,
  fixtureCategory("sport", "sport", "Sport", {}, youth),
  fixtureCategory("arts", "arts", "Arts", { position: 1 }, youth),
];

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const { writes } = await installPageApi(context, service, [
  fixturePage(service.id, { title: service.title, url: service.url, category_id: "education" }),
]);

// The first read waits, so the loading state can be measured against the loaded one
const firstRead = Promise.withResolvers();

let held = false;

await context.route("**/editor/categories", async (route) => {
  if (!held) {
    held = true;
    await firstRead.promise;
  }

  await route.fulfill({
    json: { categories: saved },
    headers: {
      "access-control-allow-origin": route.request().headers().origin ?? "*",
      "access-control-allow-credentials": "true",
    },
  });
});

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const button = (name) => page.getByRole("button", { name, exact: true });

const menu = page.getByRole("navigation", { name: "Menu", exact: true });

const categoryName = "tbody tr td:first-child > div > span:first-child";

const waitForOrder = (names) =>
  page.waitForFunction(
    ({ selector, names }) =>
      JSON.stringify([...document.querySelectorAll(selector)].map((node) => node.textContent)) ===
      JSON.stringify(names),
    { selector: categoryName, names },
  );

// A picker loads its categories as it opens: read its choices once one follows the placeholder
const categoryChoices = async (scope) => {
  const options = scope.getByLabel("Category", { exact: true }).locator("option");

  await options.nth(1).waitFor({ state: "attached" });

  return options.allTextContents();
};

try {
  await page.goto(new URL("/categories", baseURL).href);
  await page.getByRole("status").filter({ hasText: "Loading categories…" }).waitFor();

  const headerTop = () =>
    page.locator("thead").evaluate((node) => node.getBoundingClientRect().top);

  const loadingTop = await headerTop();

  firstRead.resolve();
  await waitForOrder(["Education", "Health", "Youth", "Sport", "Arts"]);
  assert.equal(await headerTop(), loadingTop, "the table header stays put as the rows arrive");
  assert.equal((await menu.boundingBox()).width, 240);
  await button("Move Health up").focus();
  await page.keyboard.press("Enter");
  await waitForOrder(["Health", "Education", "Youth", "Sport", "Arts"]);
  assert.equal(
    await button("Move Health down").evaluate((node) => node === document.activeElement),
    true,
  );
  assert.equal(
    await page.getByRole("status").filter({ hasText: "moved" }).textContent(),
    "Health moved up: 1 of 3",
  );

  await button("Edit Education").click();
  await page.getByLabel("Name", { exact: true }).fill("Schools");
  await button("Save category").click();
  await button("Delete Schools").click();
  const blocked = page.getByRole("dialog", { name: "Schools can't be deleted yet" });
  assert.match(await blocked.textContent(), /1 service is filed under Schools/);
  assert.equal(await button("Delete category").count(), 0);
  await page.getByRole("link", { name: "See its services" }).click();
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("category"), "Education");
  await page.getByRole("link", { name: service.title, exact: true }).waitFor();
  await menu.getByRole("link", { name: "Categories", exact: true }).click();
  await button("Edit Schools").waitFor();

  await button("Add category").click();
  await page.getByLabel("Name", { exact: true }).fill("Housing");
  assert.equal(await page.getByLabel("Slug", { exact: true }).inputValue(), "housing");
  await page.getByLabel("Slug", { exact: true }).fill("education");
  await page.getByRole("dialog").getByRole("button", { name: "Add category", exact: true }).click();
  assert.equal(await page.getByLabel("Slug", { exact: true }).getAttribute("aria-invalid"), "true");
  assert.equal(
    await page
      .getByLabel("Slug", { exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.getByLabel("Slug", { exact: true }).fill("housing");
  await page.getByRole("dialog").getByRole("button", { name: "Add category", exact: true }).click();
  await button("Edit Housing").waitFor();

  await menu.getByRole("link", { name: "Services", exact: true }).click();
  await button("Create service").click();

  // The list's own Category filter shares the label, so this reads the dialog's picker
  const choices = await categoryChoices(page.getByRole("dialog"));

  assert.equal(choices.includes("Housing"), false);
  assert.equal(choices.includes("Schools"), false);
  assert.equal(choices.includes("Education"), true);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: service.title, exact: true }).click();
  await page.getByRole("textbox", { name: "Page title", exact: true }).waitFor();
  assert.equal((await menu.boundingBox()).width, 56);

  if ((await button("Page settings").getAttribute("aria-expanded")) !== "true")
    await button("Page settings").click();

  const pageChoices = await categoryChoices(page);

  assert.equal(pageChoices.includes("Housing"), false);
  assert.equal(pageChoices.includes("Schools"), false);
  assert.equal(pageChoices.includes("Education"), true);
  await menu.getByRole("link", { name: "Categories", exact: true }).click();
  await button("Edit Housing").waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await button("Menu").click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).waitFor();
  await menu.getByRole("link", { name: "Categories", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).waitFor({ state: "hidden" });
  await button("Actions for Arts").click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitForOrder(["Health", "Schools", "Youth", "Arts", "Sport", "Housing"]);
  assert.equal(
    await button("Actions for Arts").evaluate((node) => node === document.activeElement),
    true,
  );
  await button("Actions for Housing").click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await button("Delete category").click();
  await button("Actions for Housing").waitFor({ state: "detached" });
  assert.equal(
    await button("Add category").evaluate((node) => node === document.activeElement),
    true,
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.reload();
  await waitForOrder(["Education", "Health", "Youth", "Sport", "Arts"]);
  assert.deepEqual(writes, []);
  await page.goto(new URL("/prototypes/components#sidebar", baseURL).href);
  await page.locator("#sidebar").getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).waitFor();
  await page
    .getByRole("dialog", { name: "Menu", exact: true })
    .getByRole("button", { name: "Categories", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "Categories: local edits, real service links, keyboard focus, desktop rail and mobile menus passed.",
  );
} finally {
  await context.close();
  await browser.close();
}
