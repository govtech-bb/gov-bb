import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

// Opt-in, against a real api_v2 and its database: nothing here is intercepted. Run the editor with
// VITE_AUTH_BYPASS=true and VITE_API_ORIGIN at an api_v2 started with AUTH_BYPASS=true and EDITOR_ORIGIN at the
// editor's origin, over a disposable database: every run adds categories and a draft service it can't remove.
//
//   node scripts/browser/categories-live.mjs http://localhost:43108/ [screenshot-dir]

const [baseURL, shots = "/tmp/c3107-categories-live"] = process.argv.slice(2);

if (!baseURL) {
  console.error("Usage: node scripts/browser/categories-live.mjs <editor-url> [screenshot-dir]");
  process.exit(2);
}

// Each run's own names, as the database keeps every earlier run's
const run = Date.now().toString(36);

const top = { title: `Live ${run}`, slug: `live-${run}` };

const renamed = `Live ${run} renamed`;

const first = { title: `First ${run}`, slug: `first-${run}` };

const second = { title: `Second ${run}`, slug: `second-${run}` };

const serviceTitle = `Live service ${run}`;

const browser = await chromium.launch();

const errors = [];

/** One author's browser: its own context, so nothing is shared with the other but the content API. */
async function author(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));

  return { context, page };
}

const button = (page, name) => page.getByRole("button", { name, exact: true });

const dialog = (page) => page.getByRole("dialog").or(page.getByRole("alertdialog"));

const names = (page) =>
  page.locator("tbody tr td:first-child .font-semibold > span:first-child").allTextContents();

const openCategories = async (page) => {
  await page.goto(new URL("/categories", baseURL).href);
  await button(page, "Add category").first().waitFor();
  await page.getByRole("status").filter({ hasText: "Loading categories…" }).waitFor({
    state: "detached",
  });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
};

const listed = async (page, title) =>
  page.getByRole("button", { name: `Edit ${title}`, exact: true }).waitFor();

const addCategory = async (page, { title, slug }, parent) => {
  await button(page, "Add category").first().click();
  await page.getByLabel("Name", { exact: true }).fill(title);
  await page.getByLabel("Slug", { exact: true }).fill(slug);

  if (parent) await page.getByLabel("Parent category").selectOption({ label: parent });
  await dialog(page).getByRole("button", { name: "Add category", exact: true }).click();
  await dialog(page).waitFor({ state: "detached" });
  await listed(page, title);
};

const order = async (page, titles) => {
  const all = await names(page);

  return all.filter((title) => titles.includes(title));
};

const a = await author("A");

const b = await author("B");

try {
  // A adds a category and two subcategories, which append to their parent's
  await openCategories(a.page);
  await addCategory(a.page, top);
  await addCategory(a.page, first, top.title);
  await addCategory(a.page, second, top.title);
  assert.deepEqual(await order(a.page, [first.title, second.title]), [first.title, second.title]);

  // A moves the second up by keyboard: saved with every sibling's version, focus and an announcement kept
  await button(a.page, `Move ${second.title} up`).focus();
  await a.page.keyboard.press("Enter");
  await a.page
    .getByRole("status")
    .filter({ hasText: `${second.title} moved up: 1 of 2` })
    .waitFor();
  assert.equal(
    await button(a.page, `Move ${second.title} down`).evaluate(
      (node) => node === document.activeElement,
    ),
    true,
  );

  // A renames the parent; its slug can't change, as it has subcategories
  await button(a.page, `Edit ${top.title}`).click();
  assert.equal(await a.page.getByLabel("Slug", { exact: true }).isDisabled(), true);
  await a.page.getByLabel("Name", { exact: true }).fill(renamed);
  await button(a.page, "Save category").click();
  await listed(a.page, renamed);

  // Both reload, and the content API has all of it
  await a.page.reload();
  await listed(a.page, renamed);
  await openCategories(b.page);
  await listed(b.page, renamed);

  for (const page of [a.page, b.page])
    assert.deepEqual(await order(page, [first.title, second.title]), [second.title, first.title]);
  assert.equal(
    (await a.page.getByText(`/${top.slug}/${first.slug}`, { exact: true }).count()) > 0,
    true,
  );

  // A stale save: A opens an edit, B changes the same category first; A keeps what it typed
  await button(a.page, `Edit ${first.title}`).click();
  await a.page.getByLabel("Description (optional)").fill("Typed by A");
  await button(b.page, `Edit ${first.title}`).click();
  await b.page.getByLabel("Description (optional)").fill("Saved by B");
  await button(b.page, "Save category").click();
  await dialog(b.page).waitFor({ state: "detached" });
  await button(a.page, "Save category").click();
  await dialog(a.page).getByText("Someone changed this category after you opened it").waitFor();
  assert.equal(await a.page.getByLabel("Description (optional)").inputValue(), "Typed by A");
  await button(a.page, "Load their version").click();
  await button(a.page, "Save category").click();
  await dialog(a.page).waitFor({ state: "detached" });

  // A opens a deletion while it's empty; B files a real service under it; the content API refuses the deletion
  await button(a.page, `Delete ${first.title}`).click();
  await b.page.goto(new URL("/services", baseURL).href);
  // The header's action; an empty list repeats it in its table, opening the same dialog
  await button(b.page, "Create service").first().click();

  const create = b.page.getByRole("dialog", { name: "Create a service", exact: true });

  await create.getByLabel("Service name", { exact: true }).fill(serviceTitle);

  // Create service lists the same categories, a subcategory under its parent
  const choices = await create
    .getByLabel("Category", { exact: true })
    .locator("option")
    .allTextContents();

  assert.equal(choices.includes(renamed), true);
  assert.equal(choices.includes(`- ${first.title}`), true);
  await create.getByLabel("Category", { exact: true }).selectOption({ label: `- ${first.title}` });
  assert.equal(
    await create.getByLabel("Path", { exact: true }).inputValue(),
    `/${top.slug}/${first.slug}/live-service-${run}`,
  );
  await create.getByRole("button", { name: "Create service", exact: true }).click();
  await b.page.getByRole("textbox", { name: "Page title", exact: true }).waitFor();

  await button(a.page, "Delete category").click();
  await dialog(a.page)
    .getByText(`${first.title} still has 1 page. Move it to another category first.`)
    .waitFor();
  await button(a.page, "Cancel").click();

  // Page settings files the service by the same list: the renamed parent, then its subcategory
  if ((await button(b.page, "Page settings").getAttribute("aria-expanded")) !== "true")
    await button(b.page, "Page settings").click();

  const category = b.page.getByLabel("Category", { exact: true });

  await category.locator("option", { hasText: renamed }).waitFor({ state: "attached" });
  assert.equal(await category.inputValue(), top.slug);
  assert.equal(await b.page.getByLabel("Subcategory", { exact: true }).inputValue(), first.slug);

  // After a reload, the count says why it can't go, with a link to the service by its slug
  await a.page.reload();
  await listed(a.page, first.title);
  await button(a.page, `Delete ${first.title}`).click();
  await dialog(a.page).getByText(`1 service is filed under ${first.title}`).waitFor();
  await dialog(a.page).getByRole("link", { name: "See its services" }).click();
  await a.page.getByRole("link", { name: serviceTitle, exact: true }).waitFor();
  assert.equal(new URL(a.page.url()).searchParams.get("category"), first.slug);

  // An empty category goes, for both authors
  await openCategories(a.page);
  await button(a.page, `Delete ${second.title}`).click();
  await button(a.page, "Delete category").click();
  await button(a.page, `Edit ${second.title}`).waitFor({ state: "detached" });
  await b.page.goto(new URL("/categories", baseURL).href);
  await listed(b.page, first.title);
  assert.equal(await button(b.page, `Edit ${second.title}`).count(), 0);

  // The same list, wide and at 390px
  await a.page.screenshot({ path: `${shots}-desktop.png`, fullPage: true });
  await a.page.setViewportSize({ width: 390, height: 844 });
  // The narrow layout has arrived once the menu column has folded into its closed drawer: until then the column
  // still holds its 240px for a frame or more, and the page is briefly wider than the screen
  await a.page.getByRole("navigation", { name: "Menu", exact: true }).waitFor({ state: "hidden" });
  await button(a.page, `Actions for ${first.title}`).waitFor();
  await a.page.screenshot({ path: `${shots}-390.png`, fullPage: true });

  const widths = await a.page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: innerWidth,
  }));

  assert.ok(widths.page <= widths.screen, `the page scrolls sideways at 390px: ${widths.page}px`);

  assert.deepEqual(errors, []);
  console.log(
    `PASS live categories (run ${run}): two authors, add/rename/order, reload, stale save, API-refused and counted deletion, empty deletion, Create service and page settings`,
  );
} finally {
  await a.context.close();
  await b.context.close();
  await browser.close();
}
