import assert from "node:assert/strict";
import { authenticatedContext } from "./auth-fixture.mjs";
import { chromium } from "./playwright.mjs";

const baseURL = process.argv[2];

// A collection with a field of each type #3782 adds, as a tool's records need them
const collection = {
  key: "shelters",
  title: "Emergency shelters",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "capacity", label: "Capacity", type: "number" },
      { key: "water", label: "Has water", type: "boolean" },
      { key: "inspected", label: "Inspected", type: "date" },
      { key: "documents", label: "Documents", type: "list" },
    ],
  },
  schema_version: 1,
  updated_at: "2026-11-19T12:00:00.000Z",
};

let version = 1;

let records = [
  {
    record_key: "st-judes",
    data: {
      key: "st-judes",
      capacity: 120,
      water: true,
      inspected: "2026-08-01",
      documents: ["ID card", "Proof of address"],
    },
    updated_at: "2026-11-19T12:00:00.000Z",
    version,
  },
];

const writes = [];

// Each value is checked as api_v2 checks it, so a value the editor sends of the wrong kind is refused on its field
const refusal = (data) => {
  if ("capacity" in data && !Number.isFinite(data.capacity))
    return { field: "capacity", message: "Enter a number, such as 12 or 0.1725." };

  if ("water" in data && data.water !== true && data.water !== false)
    return { field: "water", message: "Enter true or false." };

  if ("inspected" in data && !/^\d{4}-\d{2}-\d{2}$/.test(data.inspected))
    return { field: "inspected", message: "Enter a real date as YYYY-MM-DD." };

  if (
    "documents" in data &&
    !(Array.isArray(data.documents) && data.documents.every((item) => String(item) === item))
  )
    return { field: "documents", message: "Enter a list." };

  return undefined;
};

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

  if (path === "/collections")
    return reply({ collections: [{ ...collection, record_count: records.length }] });

  if (path === "/collections/shelters/records")
    return reply({ collection, records: records.map(({ version: _v, ...record }) => record) });

  const recordKey = path.replace("/collections/shelters/records/", "");
  const target = records.find((record) => record.record_key === recordKey);

  if (request.method() === "GET")
    return target ? reply({ collection, record: target }) : reply({ error: "not_found" }, 404);
  const body = request.postDataJSON();

  writes.push({ method: request.method(), recordKey, body });
  const problem = refusal(body.data);

  if (problem)
    return reply({ error: "validation_failed", message: problem.message, errors: [problem] }, 400);

  const saved = {
    record_key: recordKey,
    data: { ...body.data, key: recordKey },
    updated_at: new Date().toISOString(),
    version: ++version,
  };

  records = [...records.filter((record) => record !== target), saved];

  return reply(
    request.method() === "POST" ? saved : { collection, record: saved },
    request.method() === "POST" ? 201 : 200,
  );
};

const browser = await chromium.launch();

// A date box's parts follow the browser's locale: en-US types month, day, then year
const context = await authenticatedContext(browser, {
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});

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

/** The focus's next stop, by Tab, which must be `locator` and show where it is. */
async function tab(locator, what) {
  await page.keyboard.press("Tab");
  assert.equal(await focused(locator), true, `Tab reaches ${what}`);
  assert.equal(await focusShown(), true, `${what} shows its focus`);
}

// A toast is a dialog too, marked with its type
const dialog = page.locator('[role="dialog"]:not([data-type])');

const selectAll = () => page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

try {
  await page.goto(url("/collections/shelters"));
  await page.getByRole("heading", { level: 1, name: "Emergency shelters" }).waitFor();
  // The table shows each type as text
  const row = await page.locator("tbody tr").first().innerText();

  for (const text of ["120", "Yes", "2026-08-01", "ID card, Proof of address"])
    assert.match(row, new RegExp(text), `the table shows ${text}`);
  await page.screenshot({ path: "/tmp/c3782-field-types-table.png", fullPage: true });

  // Keyboard only: Edit opens the record's dialog with the focus in its first field
  const edit = page.getByRole("button", { name: "Edit st-judes" });

  await edit.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.tagName === "INPUT");
  assert.equal(await focused(dialog.getByLabel("Key", { exact: true })), true);

  // The number box: typed into, its keypad a number's
  const capacity = dialog.getByLabel("Capacity (optional)");

  await tab(capacity, "the number box");
  assert.equal(await capacity.inputValue(), "120");
  assert.equal(await capacity.getAttribute("inputmode"), "decimal");
  await selectAll();
  await page.keyboard.type("1,000");

  // The tick box: Space unticks it
  const water = dialog.getByRole("checkbox", { name: "Has water" });

  await tab(water, "the tick box");
  assert.equal(await water.getAttribute("aria-checked"), "true");
  await page.keyboard.press("Space");
  assert.equal(await water.getAttribute("aria-checked"), "false");

  // The date box: the date typed part by part
  const inspected = dialog.getByLabel("Inspected (optional)");

  await tab(inspected, "the date box");
  assert.equal(await inspected.inputValue(), "2026-08-01");
  await page.keyboard.type("12252026");
  assert.equal(await inspected.inputValue(), "2026-12-25");

  // The list editor: each item's box, then Move down (Move up is off for the first item), then Remove
  const first = dialog.getByLabel("Documents, item 1 of 2");

  await page.keyboard.press("Tab");

  // A date box can hold the focus across its parts: Tab past them to the list
  for (let step = 0; step < 3 && !(await focused(first)); step++) await page.keyboard.press("Tab");
  assert.equal(await focused(first), true, "Tab reaches the list's first item");
  assert.equal(await focusShown(), true, "the list's first item shows its focus");
  assert.equal(await first.inputValue(), "ID card");
  await tab(
    dialog.getByRole("button", { name: "Move Documents item 1 down" }),
    "Move Documents item 1 down",
  );
  await page.keyboard.press("Enter");
  // The moved item is now last, so the focus goes to its Move up, and a screen reader hears where it went
  const movedUp = dialog.getByRole("button", { name: "Move Documents item 2 up" });

  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Move Documents item 2 up",
  );
  assert.equal(await focused(movedUp), true, "the focus follows the moved item");
  assert.equal(await focusShown(), true, "Move up shows its focus");
  assert.equal(await dialog.getByLabel("Documents, item 2 of 2").inputValue(), "ID card");
  await dialog.getByText("Item moved to position 2 of 2.").waitFor();

  // Add item: the new item's box takes the focus
  await tab(
    dialog.getByRole("button", { name: "Remove Documents item 2" }),
    "Remove Documents item 2",
  );
  await tab(dialog.getByRole("button", { name: "Add item to Documents" }), "Add item");
  await page.keyboard.press("Enter");
  const added = dialog.getByLabel("Documents, item 3 of 3");

  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Documents, item 3 of 3",
  );
  assert.equal(await focused(added), true, "the new item takes the focus");
  await page.keyboard.type("Proof of insurance");
  await page.screenshot({ path: "/tmp/c3782-field-types-dialog.png", fullPage: true });

  // Remove item: the focus goes to the item now in its place
  await tab(
    dialog.getByRole("button", { name: "Move Documents item 3 up" }),
    "Move Documents item 3 up",
  );
  await tab(
    dialog.getByRole("button", { name: "Remove Documents item 3" }),
    "Remove Documents item 3",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Documents, item 2 of 2",
  );

  // A number api_v2 can't read is refused on its field, and what was typed stays
  await page.keyboard.press("Enter");
  await dialog.getByText("Enter a number, such as 12 or 0.1725.").waitFor();
  assert.equal(await capacity.inputValue(), "1,000");
  assert.equal(await capacity.getAttribute("aria-invalid"), "true");
  assert.equal(writes.at(-1).body.data.capacity, "1,000");
  await page.screenshot({ path: "/tmp/c3782-field-types-error.png" });

  // Corrected, it saves each value as its type
  await capacity.focus();
  await selectAll();
  await page.keyboard.type("0.1725");
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "detached" });
  assert.deepEqual(writes.at(-1).body.data, {
    key: "st-judes",
    capacity: 0.1725,
    water: false,
    inspected: "2026-12-25",
    documents: ["Proof of address", "ID card"],
  });
  await page.getByText("Proof of address, ID card").waitFor();

  // At phone width the list editor fits, and the page doesn't scroll sideways
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url("/collections/shelters?record=st-judes"));
  await dialog.getByLabel("Documents, item 1 of 2").waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "the page itself doesn't scroll sideways",
  );
  await page.screenshot({ path: "/tmp/c3782-field-types-390.png", fullPage: true });

  assert.deepEqual(errors, []);
  console.log(
    "Field types: number, tick box, date and list editor by keyboard only, with visible focus, moves, adds, removes, a refusal on its field, typed save and 390px passed.",
  );
} finally {
  await browser.close();
}
