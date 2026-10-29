import assert from "node:assert/strict";
import { authenticatedContext } from "./auth-fixture.mjs";
import { chromium } from "./playwright.mjs";

const baseURL = process.argv[2];

const collection = {
  key: "contacts",
  title: "Ministries and departments",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "phone", label: "Telephone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address", type: "text" },
    ],
  },
  schema_version: 1,
  updated_at: "2026-10-26T12:00:00.000Z",
};

let clock = Date.parse("2026-10-26T12:00:00.000Z");

const tick = () => new Date(++clock).toISOString();

// The content API's records, kept with versions, so every write is checked as api_v2 checks it
let records = [
  {
    record_key: "barbados-drug-service",
    data: {
      key: "barbados-drug-service",
      name: "Barbados Drug Service",
      phone: "(246) 535-4300",
      email: "management@drugservice.gov.bb",
      address: "6th Floor, Warrens Tower II, Warrens, St. Michael, and a long line to wrap",
    },
    updated_at: tick(),
  },
  {
    record_key: "nis-severance-payment-department",
    data: {
      key: "nis-severance-payment-department",
      name: "NIS Severance Payment Department",
      phone: "+1 246-431-7400",
    },
    updated_at: tick(),
  },
];

const writes = [];

const sorted = () => records.toSorted((a, b) => a.record_key.localeCompare(b.record_key));

const serveCollections = async (route) => {
  const request = route.request();

  // The editor's own /collections pages share the paths; only the API's fetches are answered
  if (request.resourceType() !== "fetch" && request.method() !== "OPTIONS") return route.fallback();
  const path = decodeURIComponent(new URL(request.url()).pathname);

  const headers = {
    "access-control-allow-origin": request.headers().origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, if-updated-at",
    "cache-control": "no-store",
  };

  const reply = (json, status = 200) => route.fulfill({ status, headers, json });

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  if (path === "/collections")
    return reply({ collections: [{ ...collection, record_count: records.length }] });

  if (path === "/collections/contacts/records") return reply({ collection, records: sorted() });

  const recordKey = path.replace("/collections/contacts/records/", "");
  const body = request.postData() ? request.postDataJSON() : undefined;
  const ifUpdatedAt = request.headers()["if-updated-at"];
  const target = records.find((record) => record.record_key === recordKey);

  writes.push({ method: request.method(), recordKey, body, ifUpdatedAt });

  if (request.method() === "POST" && target)
    return reply({ error: "record_exists", message: "Taken." }, 409);

  if (request.method() !== "POST" && !target) return reply({ error: "not_found" }, 404);

  if (target && ifUpdatedAt && ifUpdatedAt !== target.updated_at)
    return reply({ error: "conflict", message: "Changed." }, 409);

  if (request.method() === "DELETE") {
    records = records.filter((record) => record !== target);

    return route.fulfill({ status: 204, headers });
  }

  const email = body.data.email;

  if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return reply(
      {
        error: "validation_failed",
        message: "Not saved.",
        errors: [{ field: "email", message: "Enter an email address." }],
      },
      400,
    );

  const saved = {
    record_key: recordKey,
    data: { ...body.data, key: recordKey },
    updated_at: tick(),
  };

  records = [...records.filter((record) => record !== target), saved];

  return reply(saved, request.method() === "POST" ? 201 : 200);
};

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

await context.route("**/collections**", serveCollections);

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = (path) => new URL(path, baseURL).href;

const focused = (locator) => locator.evaluate((node) => node === document.activeElement);

// A visible focus indicator: the browser shows keyboard focus here, and the element draws it, as an outline or a ring
// that differs from how it looks unfocused
const focusShown = () =>
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

const tabTo = async (locator, limit = 60) => {
  for (let step = 0; step < limit; step++) {
    if (await focused(locator)) return;
    await page.keyboard.press("Tab");
  }

  throw new Error("The keyboard never reached it");
};

// A toast is a dialog too, marked with its type
const dialog = page.locator('[role="dialog"]:not([data-type])');

try {
  // The menu leads to Collections, which lists each one with its record count
  await page.goto(url("/services"));
  const menuItem = page.getByRole("link", { name: "Collections", exact: true });

  await menuItem.waitFor();
  await tabTo(menuItem);
  assert.equal(await focusShown(), true, "the menu's Collections link shows its focus");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { level: 1, name: "Collections" }).waitFor();
  const open = page.getByRole("link", { name: "Ministries and departments" });

  await open.waitFor();
  assert.match(await page.locator("tbody tr").first().innerText(), /2/);

  // Its name opens its records, a column per field
  await tabTo(open);
  assert.equal(await focusShown(), true, "a collection's link shows its focus");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { level: 1, name: "Ministries and departments" }).waitFor();
  assert.deepEqual(await page.locator("thead th").allInnerTexts(), [
    "Key",
    "Name",
    "Telephone",
    "Email",
    "Address",
    "Actions",
  ]);
  await page.screenshot({ path: "/tmp/c3184-collections-table.png", fullPage: true });

  // Keyboard only: Edit opens the record's dialog, its address naming the record, the focus in its first field
  const edit = page.getByRole("button", { name: "Edit nis-severance-payment-department" });

  await tabTo(edit);
  assert.equal(await focusShown(), true, "Edit shows its focus");
  await page.keyboard.press("Enter");
  await dialog.waitFor();
  assert.match(page.url(), /\/collections\/contacts\?record=nis-severance-payment-department$/);
  assert.equal(await focused(dialog.getByLabel("Key", { exact: true })), true);
  assert.equal(await focusShown(), true, "the dialog's first field shows its focus");

  // A value api_v2 refuses shows under its field, and what was typed stays
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(await focused(dialog.getByLabel("Email (optional)")), true);
  await page.keyboard.type("not-an-email");
  await page.keyboard.press("Enter");
  await dialog.getByText("Enter an email address.").waitFor();
  assert.equal(await dialog.getByLabel("Email (optional)").inputValue(), "not-an-email");
  assert.equal(await dialog.getByLabel("Email (optional)").getAttribute("aria-invalid"), "true");
  await page.screenshot({ path: "/tmp/c3184-collections-field-error.png" });

  await dialog.getByLabel("Email (optional)").fill("severance@nis.gov.bb");
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "detached" });
  assert.doesNotMatch(page.url(), /record=/);
  await page.getByText("severance@nis.gov.bb").waitFor();
  assert.equal(writes.at(-1).method, "PUT");

  // A save over a version someone else replaced offers the page's three choices
  await page.goto(url("/collections/contacts?record=barbados-drug-service"));
  await dialog.waitFor();
  await dialog.getByLabel("Name (optional)").fill("Drug Service (mine)");
  records = records.map((record) =>
    record.record_key === "barbados-drug-service"
      ? { ...record, data: { ...record.data, name: "Drug Service (theirs)" }, updated_at: tick() }
      : record,
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await dialog
    .getByText("A newer version of this record has been saved since you opened it.")
    .waitFor();

  for (const name of ["Keep my version", "Load saved version", "Download my version"])
    await dialog.getByRole("button", { name }).waitFor();
  await page.screenshot({ path: "/tmp/c3184-collections-stale.png" });

  const keep = dialog.getByRole("button", { name: "Keep my version" });

  await tabTo(keep);
  assert.equal(await focusShown(), true, "Keep my version shows its focus");
  await page.keyboard.press("Enter");
  // Its notice goes, and the focus moves into the form rather than to the page behind
  await page.waitForFunction(() =>
    document.querySelector('[role="dialog"]:not([data-type])')?.contains(document.activeElement),
  );
  assert.equal(await focused(dialog.getByLabel("Key", { exact: true })), true);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(
    records.find((r) => r.record_key === "barbados-drug-service").data.name,
    "Drug Service (mine)",
  );

  // Add record, from the keyboard
  const add = page.getByRole("button", { name: "Add record" });

  await add.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor();
  assert.equal(await focused(dialog.getByLabel("Key", { exact: true })), true);
  await page.keyboard.type("barbados-revenue-authority");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Barbados Revenue Authority");
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "detached" });
  await page.getByText("Barbados Revenue Authority").waitFor();

  // Delete asks first, Cancel holding the focus, and Escape keeps the record
  const remove = page.getByRole("button", { name: "Delete barbados-revenue-authority" });

  await remove.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog");

  await confirm.waitFor();
  assert.equal(await focused(confirm.getByRole("button", { name: "Cancel" })), true);
  assert.equal(await focusShown(), true, "Cancel shows its focus");
  await page.keyboard.press("Escape");
  await confirm.waitFor({ state: "detached" });
  assert.equal(await focused(remove), true, "the focus returns to Delete");
  await page.keyboard.press("Enter");
  await confirm.waitFor();
  await confirm.getByRole("button", { name: "Delete record" }).click();
  await confirm.waitFor({ state: "detached" });
  await page.getByText("Barbados Revenue Authority").waitFor({ state: "detached" });
  assert.equal(await focused(add), true, "the focus goes to Add record once the row has gone");

  // A phone-width screen keeps the table in its own scrolling region, still reachable by keyboard
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator("tbody tr").first().waitFor();
  const region = page.getByRole("region", { name: "Ministries and departments records" });

  assert.equal(await region.getAttribute("tabindex"), "0");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "the page itself doesn't scroll sideways",
  );
  await page.screenshot({ path: "/tmp/c3184-collections-390.png", fullPage: true });

  assert.deepEqual(errors, []);
  console.log(
    "Collections: menu, list, table, keyboard-only edit/add/delete, field errors, stale save choices, visible focus and 390px passed.",
  );
} finally {
  await browser.close();
}
