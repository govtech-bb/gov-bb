import assert from "node:assert/strict";
import { authenticatedContext, employeeSession } from "./auth-fixture.mjs";
import { chromium } from "./playwright.mjs";

const baseURL = process.argv[2];

// The content API's collections, as api_v2 keeps them; a create is checked as api_v2 checks it (#3681)
const collections = [
  {
    key: "contacts",
    title: "Ministries and departments",
    record_key: "key",
    schema: { fields: [{ key: "key", label: "Key", type: "slug" }] },
    schema_version: 1,
    updated_at: "2026-11-19T12:00:00.000Z",
  },
];

const records = new Map([["contacts", []]]);

const created = [];

const serveCollections = async (route) => {
  const request = route.request();

  // The editor's own /collections pages share the paths; only the API's fetches are answered
  if (request.resourceType() !== "fetch" && request.method() !== "OPTIONS") return route.fallback();
  const path = decodeURIComponent(new URL(request.url()).pathname);

  const headers = {
    "access-control-allow-origin": request.headers().origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };

  const reply = (json, status = 200) => route.fulfill({ status, headers, json });

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  if (path === "/collections" && request.method() === "GET")
    return reply({
      collections: collections.map((item) => ({
        ...item,
        record_count: records.get(item.key).length,
      })),
    });

  if (path === "/collections" && request.method() === "POST") {
    const body = request.postDataJSON();

    created.push(body);

    if (collections.some((item) => item.key === body.key))
      return reply(
        {
          error: "collection_exists",
          message: `There is already a collection ${body.key}.`,
          errors: [{ field: "key", message: `There is already a collection ${body.key}.` }],
        },
        409,
      );

    const unknown = body.schema.fields.findIndex(
      (field) => !["text", "slug", "email"].includes(field.type),
    );

    if (unknown >= 0)
      return reply(
        {
          error: "validation_failed",
          message: "Choose one of text, slug, email.",
          errors: [
            { field: `schema.fields.${unknown}.type`, message: "Choose one of text, slug, email." },
          ],
        },
        422,
      );

    const collection = { ...body, schema_version: 1, updated_at: new Date().toISOString() };

    collections.push(collection);
    records.set(body.key, []);

    return reply(collection, 201);
  }

  const [, key, , recordKey] = path.split("/").slice(1);
  const collection = collections.find((item) => item.key === key);

  if (!collection) return reply({ error: "not_found", message: `No collection ${key}.` }, 404);

  if (!recordKey) return reply({ collection, records: records.get(key) });

  const target = records.get(key).find((record) => record.record_key === recordKey);

  if (request.method() === "GET")
    return target ? reply({ collection, record: target }) : reply({ error: "not_found" }, 404);

  if (request.method() === "POST") {
    const saved = {
      record_key: recordKey,
      data: { ...request.postDataJSON().data, [collection.record_key]: recordKey },
      updated_at: new Date().toISOString(),
      version: 1,
    };

    records.set(key, [...records.get(key), saved]);

    return reply(saved, 201);
  }

  return reply({ error: "not_found" }, 404);
};

const browser = await chromium.launch();

const url = (path) => new URL(path, baseURL).href;

const errors = [];

/** A browser context signed in as an employee with these roles, over the collections fixture. */
async function signedIn(roles, viewport = { width: 1440, height: 1000 }) {
  const context = await authenticatedContext(browser, { viewport });

  // Registered after the fixture's own, so it answers first
  await context.route("**/editor/me", (route) =>
    route.fulfill({
      json: { ...employeeSession().user, roles },
      headers: {
        "access-control-allow-origin": route.request().headers().origin ?? "*",
        "access-control-allow-credentials": "true",
        "cache-control": "no-store",
      },
    }),
  );
  await context.route("**/collections**", serveCollections);
  const page = await context.newPage();

  page.on("pageerror", (error) => errors.push(error.message));

  return page;
}

const focused = (page, locator) => locator.evaluate((node) => node === document.activeElement);

// A visible focus indicator: the browser shows keyboard focus here, and the element draws it, as an outline or a ring
// that differs from how it looks unfocused
const focusShown = (page) =>
  page.evaluate(() => {
    const node = document.activeElement;

    if (!(node instanceof HTMLElement) || !node.matches(":focus-visible")) return false;
    const look = (style) => `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`;
    const focusedLook = look(getComputedStyle(node));
    const twin = node.cloneNode(true);

    twin.removeAttribute("id");
    twin.tabIndex = -1;
    node.after(twin);
    const restingLook = look(getComputedStyle(twin));

    twin.remove();

    return focusedLook !== restingLook;
  });

/** The focus's next stop, by Tab, which must show where it is. */
async function tab(page, locator, what) {
  await page.keyboard.press("Tab");
  assert.equal(await focused(page, locator), true, `Tab reaches ${what}`);
  assert.equal(await focusShown(page), true, `${what} shows its focus`);
}

try {
  // An approver adds a collection with the keyboard only, each stop showing its focus
  const page = await signedIn(["editor", "approver"]);
  const dialog = page.locator('[role="dialog"]:not([data-type])');

  await page.goto(url("/collections"));
  await page.getByRole("link", { name: "Ministries and departments" }).waitFor();
  const add = page.getByRole("button", { name: "Add collection" }).first();

  for (let step = 0; step < 60 && !(await focused(page, add)); step++)
    await page.keyboard.press("Tab");
  assert.equal(await focused(page, add), true, "the keyboard reaches Add collection");
  assert.equal(await focusShown(page), true, "Add collection shows its focus");
  await page.keyboard.press("Enter");
  await dialog.waitFor();

  const title = dialog.getByLabel("Title");

  assert.equal(await focused(page, title), true, "the dialog opens on Title");
  assert.equal(await focusShown(page), true, "Title shows its focus");
  await page.keyboard.type("Branch offices");
  const key = dialog.getByLabel("Key", { exact: true }).first();

  await tab(page, key, "the collection's Key");
  assert.equal(await key.inputValue(), "branch-offices", "the key follows the title");

  // The first field, Key, a slug, is offered as the record key
  const rows = dialog.locator("[data-row]");
  const firstRow = rows.nth(0);

  await tab(page, firstRow.getByLabel("Key", { exact: true }), "the first field's Key");
  await tab(page, firstRow.getByLabel("Label"), "the first field's Label");
  await tab(page, firstRow.getByLabel("Type"), "the first field's Type");
  await tab(page, firstRow.getByRole("button", { name: "Remove field 1" }), "Remove field 1");
  const addField = dialog.getByRole("button", { name: "Add field" });

  await tab(page, addField, "Add field");
  await page.keyboard.press("Enter");
  const second = rows.nth(1);

  assert.equal(
    await focused(page, second.getByLabel("Key", { exact: true })),
    true,
    "a new field's Key takes the focus",
  );
  assert.equal(await focusShown(page), true, "the new field's Key shows its focus");
  await page.keyboard.type("name");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Name");
  await addField.focus();
  await page.keyboard.press("Enter");
  const third = rows.nth(2);

  await page.keyboard.type("email");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Email");
  await page.keyboard.press("Tab");
  assert.equal(await focused(page, third.getByLabel("Type")), true);
  await third.getByLabel("Type").selectOption("email");
  assert.deepEqual(await third.getByLabel("Type").locator("option").allInnerTexts(), [
    "Text",
    "Slug",
    "Email address",
  ]);
  const recordKey = dialog.getByLabel("Record key");

  assert.equal(await recordKey.inputValue(), "0", "the first field is the record key");
  await page.screenshot({ path: "/tmp/c3681-collection-create-dialog.png", fullPage: true });

  // A field the dialog finds a problem with says so, and takes the focus
  await second.getByLabel("Label").fill("");
  await page.keyboard.press("Enter");
  await dialog.getByText("Enter a label").waitFor();
  assert.equal(await focused(page, second.getByLabel("Label")), true);
  assert.equal(await second.getByLabel("Label").getAttribute("aria-invalid"), "true");
  assert.equal(created.length, 0, "nothing is sent while a field has a problem");
  await page.screenshot({ path: "/tmp/c3681-collection-create-error.png" });
  await page.keyboard.type("Name");

  // Enter adds it; the new collection opens, its first record a keyboard press away
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { level: 1, name: "Branch offices" }).waitFor();
  assert.match(page.url(), /\/collections\/branch-offices$/);
  assert.deepEqual(created.at(-1), {
    key: "branch-offices",
    title: "Branch offices",
    record_key: "key",
    schema: {
      fields: [
        { key: "key", label: "Key", type: "slug" },
        { key: "name", label: "Name", type: "text" },
        { key: "email", label: "Email", type: "email" },
      ],
    },
  });
  const addRecord = page.getByRole("button", { name: "Add record" }).first();

  await page.waitForFunction(() => document.activeElement?.textContent === "Add record");
  assert.equal(await focused(page, addRecord), true, "Add record takes the focus");
  assert.equal(await focusShown(page), true, "Add record shows its focus");
  await page.screenshot({ path: "/tmp/c3681-collection-created.png", fullPage: true });

  // The new collection takes a record through the record dialog, with no code change
  await page.keyboard.press("Enter");
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.tagName === "INPUT");
  assert.equal(await focused(page, dialog.getByLabel("Key", { exact: true })), true);
  await page.keyboard.type("north");
  await page.keyboard.press("Tab");
  await page.keyboard.type("North office");
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "detached" });
  await page.getByText("North office").waitFor();
  assert.deepEqual(records.get("branch-offices")[0].data, { key: "north", name: "North office" });

  // A key another collection has is refused on Key
  await page.goto(url("/collections"));
  await page.getByRole("button", { name: "Add collection" }).first().click();
  await dialog.waitFor();
  await dialog.getByLabel("Title").fill("Contacts again");
  await dialog.getByLabel("Key", { exact: true }).first().fill("contacts");
  await page.keyboard.press("Enter");
  await dialog.getByText("Another collection already has this key").waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });

  // At phone width the dialog's fields stack and the page doesn't scroll sideways
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Add collection" }).first().click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Add field" }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "the page itself doesn't scroll sideways",
  );
  await page.screenshot({ path: "/tmp/c3681-collection-create-390.png", fullPage: true });

  // Someone who is neither an admin nor an approver sees Add collection turned off, and why
  const editor = await signedIn(["editor"]);

  await editor.goto(url("/collections"));
  await editor.getByText("Only admins and approvers can add collections.").waitFor();
  assert.equal(
    await editor.getByRole("button", { name: "Add collection" }).first().isDisabled(),
    true,
  );

  // An admin may add one
  const admin = await signedIn(["admin"]);

  await admin.goto(url("/collections"));
  await admin.getByRole("link", { name: "Ministries and departments" }).waitFor();
  assert.equal(
    await admin.getByRole("button", { name: "Add collection" }).first().isDisabled(),
    false,
  );

  assert.deepEqual(errors, []);
  console.log(
    "Add collection: keyboard-only create with visible focus, field and key refusals, opening the new collection, its first record, the role gate and 390px passed.",
  );
} finally {
  await browser.close();
}
