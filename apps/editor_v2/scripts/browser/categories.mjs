import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixtureCategory, fixturePage, installPageApi } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

const baseURL = process.argv[2];

const service = { ...servicesFixture[0], category: { slug: "education", title: "Education" } };

const id = (n) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;

const LONG =
  "Pensions, gratuities and the National Insurance contributions of self-employed workers";

const youth = fixtureCategory(id(3), "youth", "Youth", { position: 2 });

// The content API's categories, kept with versions, so every write is checked as api_v2 checks it
let stored = [
  fixtureCategory(id(1), "education", "Education", { position: 0, services: 1 }),
  fixtureCategory(id(2), "health", "Health", { position: 1, reserved_route: true }),
  youth,
  fixtureCategory(id(4), "sport", "Sport", { position: 0 }, youth),
  fixtureCategory(id(5), "arts", LONG, { position: 1 }, youth),
];

let clock = Date.parse(stored[0].updated_at);

const tick = () => new Date(++clock).toISOString();

const writes = [];

const urlOf = (row) => {
  const parent = stored.find((other) => other.id === row.parent_id);

  return parent ? `/${parent.slug}/${row.slug}` : `/${row.slug}`;
};

const ordered = () => {
  const group = (parent) =>
    stored.filter((row) => row.parent_id === parent).toSorted((a, b) => a.position - b.position);

  return group(null)
    .flatMap((row) => [row, ...group(row.id)])
    .map((row) => ({ ...row, url: urlOf(row) }));
};

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

await installPageApi(context, service, [
  fixturePage(service.id, { title: service.title, url: service.url, category_id: id(1) }),
]);

// The first read waits, so the loading state can be measured against the loaded one; then reads can fail on demand
const firstRead = Promise.withResolvers();

let held = false;

let failReads = 0;

// The content API's category routes, for every browser context the suite opens
const serveCategories = async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  const headers = {
    "access-control-allow-origin": request.headers().origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, if-updated-at",
    "cache-control": "no-store",
  };

  const reply = (json, status = 200) => route.fulfill({ status, headers, json });

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  if (request.method() === "GET") {
    if (!held) {
      held = true;
      await firstRead.promise;
    }

    if (failReads > 0) {
      failReads -= 1;

      return reply({ error: "unavailable" }, 503);
    }

    return reply({ categories: ordered() });
  }

  const body = request.postData() ? request.postDataJSON() : undefined;

  writes.push({ method: request.method(), path, body });

  if (request.method() === "POST") {
    if (stored.some((row) => row.slug === body.slug))
      return reply(
        {
          error: "validation_failed",
          message: "Not saved.",
          errors: [{ field: "slug", message: "Another category already uses this slug." }],
        },
        422,
      );

    const row = {
      ...fixtureCategory(id(100 + writes.length), body.slug, body.title.trim()),
      parent_id: body.parent_id,
      description: body.description,
      position: stored.filter((other) => other.parent_id === body.parent_id).length,
      updated_at: tick(),
    };

    stored.push(row);

    return reply({ ...row, url: urlOf(row) }, 201);
  }

  if (path === "/editor/categories/order") {
    const siblings = stored.filter((row) => row.parent_id === body.parent_id);

    const current =
      siblings.length === body.expected.length &&
      body.expected.every(
        (expected) =>
          siblings.find((row) => row.id === expected.id)?.updated_at === expected.updated_at,
      );

    if (!current) return reply({ error: "conflict", message: "These categories changed." }, 409);
    const stamp = tick();

    stored = stored.map((row) => {
      const position = body.ordered_ids.indexOf(row.id);

      return position === -1 || position === row.position
        ? row
        : { ...row, position, updated_at: stamp };
    });

    return reply({ categories: ordered().filter((row) => row.parent_id === body.parent_id) });
  }

  const target = stored.find((row) => path === `/editor/categories/${row.id}`);

  if (!target) return reply({ error: "not_found", message: "No category." }, 404);

  if (request.headers()["if-updated-at"] !== target.updated_at)
    return reply({ error: "conflict", message: "These categories changed." }, 409);

  if (request.method() === "DELETE") {
    stored = stored.filter((row) => row !== target);

    return route.fulfill({ status: 204, headers });
  }

  const saved = { ...target, ...body, title: body.title.trim(), updated_at: tick() };

  stored = stored.map((row) => (row === target ? saved : row));

  return reply({ ...saved, url: urlOf(saved) });
};

await context.route("**/editor/categories{,/**}", serveCategories);

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const button = (name) => page.getByRole("button", { name, exact: true });

const focused = (locator) => locator.evaluate((node) => node === document.activeElement);

const menu = page.getByRole("navigation", { name: "Menu", exact: true });

const categoryName = "tbody tr td:first-child .font-semibold > span:first-child";

const waitForOrder = (names) =>
  page.waitForFunction(
    ({ selector, names }) =>
      JSON.stringify([...document.querySelectorAll(selector)].map((node) => node.textContent)) ===
      JSON.stringify(names),
    { selector: categoryName, names },
  );

const announced = (words) =>
  page.waitForFunction(
    (words) =>
      [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === words),
    words,
  );

const fitsWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

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
  await waitForOrder(["Education", "Health", "Youth", "Sport", LONG]);
  assert.equal(await headerTop(), loadingTop, "the table header stays put as the rows arrive");
  assert.equal(await page.getByText("Preview only").count(), 0);
  assert.equal(await fitsWidth(), true, "a long name wraps at desktop width");

  // A keyboard move saves the whole group's order and keeps the focus
  await button("Move Health up").focus();
  await page.keyboard.press("Enter");
  await waitForOrder(["Health", "Education", "Youth", "Sport", LONG]);
  await announced("Health moved up: 1 of 3");
  assert.equal(await focused(button("Move Health down")), true);
  assert.deepEqual(writes.at(-1).body.ordered_ids, [id(2), id(1), id(3)]);

  // An app route's category keeps its address
  await button("Edit Health").click();
  assert.equal(await page.getByLabel("Slug", { exact: true }).isDisabled(), true);
  await button("Cancel").click();
  await button("Delete Health").click();
  const reserved = page.getByRole("dialog", { name: "Health can't be deleted yet" });

  assert.match(await reserved.textContent(), /site's own is at \/health/);
  await reserved.getByText("Close", { exact: true }).click();
  await reserved.waitFor({ state: "hidden" });

  // A rename keeps the slug, so the link to its services still filters
  await button("Edit Education").click();
  await page.getByLabel("Name", { exact: true }).fill("Schools");
  await button("Save category").click();
  await button("Delete Schools").click();
  const blocked = page.getByRole("dialog", { name: "Schools can't be deleted yet" });
  assert.match(await blocked.textContent(), /1 service is filed under Schools/);
  assert.equal(await button("Delete category").count(), 0);
  await page.getByRole("link", { name: "See its services" }).click();
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("category"), "education");
  await page.getByRole("link", { name: service.title, exact: true }).waitFor();
  await menu.getByRole("link", { name: "Categories", exact: true }).click();
  await button("Edit Schools").waitFor();

  // A refused slug shows on its field, which takes the focus; then it's added at the end
  await button("Add category").click();
  await page.getByLabel("Name", { exact: true }).fill("Housing");
  assert.equal(await page.getByLabel("Slug", { exact: true }).inputValue(), "housing");
  await page.getByLabel("Slug", { exact: true }).fill("health");
  await page.getByRole("dialog").getByRole("button", { name: "Add category", exact: true }).click();
  assert.equal(await page.getByLabel("Slug", { exact: true }).getAttribute("aria-invalid"), "true");
  assert.equal(await focused(page.getByLabel("Slug", { exact: true })), true);
  await page.getByLabel("Slug", { exact: true }).fill("housing");
  await page.getByRole("dialog").getByRole("button", { name: "Add category", exact: true }).click();
  await button("Edit Housing").waitFor();
  assert.equal(writes.filter((write) => write.method === "POST").length, 1);

  // Create service and page settings read the same list
  await menu.getByRole("link", { name: "Services", exact: true }).click();
  await button("Create service").click();
  const choices = await categoryChoices(page.getByRole("dialog"));

  assert.equal(choices.includes("Housing"), true);
  assert.equal(choices.includes("Schools"), true);
  assert.equal(choices.includes(`- ${LONG}`), true);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: service.title, exact: true }).click();
  await page.getByRole("textbox", { name: "Page title", exact: true }).waitFor();
  assert.equal((await menu.boundingBox()).width, 56);

  if ((await button("Page settings").getAttribute("aria-expanded")) !== "true")
    await button("Page settings").click();

  const pageChoices = await categoryChoices(page);

  assert.equal(pageChoices.includes("Housing"), true);
  assert.equal(pageChoices.includes("Schools"), true);
  await menu.getByRole("link", { name: "Categories", exact: true }).click();
  await button("Edit Housing").waitFor();

  // A read that keeps failing, past the three retries, says so; Try again reads it again
  failReads = 4;
  await page.reload();
  await page.getByText("We could not load categories").waitFor();
  await button("Try again").click();
  await button("Edit Housing").waitFor();

  // Narrow: the menu folds away, the actions fold into a menu, and nothing scrolls sideways
  await page.setViewportSize({ width: 390, height: 844 });
  await button("Menu").click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).waitFor();
  await menu.getByRole("link", { name: "Categories", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await fitsWidth(), true, "a long name wraps at 390px");
  await button(`Actions for ${LONG}`).click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitForOrder(["Health", "Schools", "Youth", LONG, "Sport", "Housing"]);
  assert.equal(await focused(button(`Actions for ${LONG}`)), true);
  await button("Actions for Housing").click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await button("Delete category").click();
  await button("Actions for Housing").waitFor({ state: "detached" });
  assert.equal(await focused(button("Add category")), true);
  assert.equal(await fitsWidth(), true);

  // Every change was the content API's, so a reload shows them all
  await page.reload();
  await waitForOrder(["Health", "Schools", "Youth", LONG, "Sport"]);
  assert.deepEqual(errors, []);

  // A finger gets 44px targets that don't overlap: the phone's one Actions trigger, and a tablet's row of icons
  const touch = await authenticatedContext(browser, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  await installPageApi(touch, service, []);
  await touch.route("**/editor/categories{,/**}", serveCategories);

  const finger = await touch.newPage();

  finger.on("pageerror", (error) => errors.push(error.message));

  // Each visible row control's box, left to right, and whether any overlaps the one before it
  const targets = (name) =>
    finger
      .locator("tbody tr")
      .filter({ hasText: name })
      .first()
      .locator("button:visible")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();

          return { left: box.left, right: box.right, width: box.width, height: box.height };
        }),
      );

  const fingerSized = (boxes) =>
    boxes.length > 0 &&
    boxes.every((box) => box.width >= 44 && box.height >= 44) &&
    boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right);

  try {
    await finger.goto(new URL("/categories", baseURL).href);
    await finger.getByRole("button", { name: "Actions for Schools", exact: true }).waitFor();

    const phone = await targets("Schools");

    assert.equal(phone.length, 1, "a phone row has one Actions trigger");
    assert.ok(fingerSized(phone), `phone targets: ${JSON.stringify(phone)}`);

    // The trigger opens its menu from the keyboard, and Escape gives it the focus back
    const trigger = finger.getByRole("button", { name: "Actions for Schools", exact: true });

    await trigger.focus();
    await finger.keyboard.press("Enter");
    await finger.getByRole("menuitem", { name: "Edit", exact: true }).waitFor();
    await finger.keyboard.press("Escape");
    await finger.getByRole("menuitem", { name: "Edit", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);

    await finger.setViewportSize({ width: 1024, height: 1366 });
    await finger.getByRole("button", { name: "Move Schools up", exact: true }).waitFor();

    const tablet = await targets("Schools");

    assert.equal(tablet.length, 4, "a tablet row shows its four actions");
    assert.ok(fingerSized(tablet), `tablet targets: ${JSON.stringify(tablet)}`);
  } finally {
    await touch.close();
  }

  assert.deepEqual(errors, []);
  console.log(
    "Categories: API writes, versioned moves, shared pickers, keyboard focus, errors, long names, desktop and 390px, 44px touch targets passed.",
  );
} finally {
  await context.close();
  await browser.close();
}
