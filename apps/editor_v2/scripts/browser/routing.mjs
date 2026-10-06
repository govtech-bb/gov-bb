import { authenticatedContext } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser);

const page = await context.newPage();

page.setDefaultTimeout(15_000);

page.setDefaultNavigationTimeout(15_000);

const base = new URL(process.argv[2] ?? "http://localhost:3015/");

const serviceId = "service/with spaces";

const ids = ["document #é", "fees", "contact"];

const path = (id) => `/services/${encodeURIComponent(serviceId)}/${encodeURIComponent(id)}`;

const url = (id) => new URL(path(id), base).href;

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

await context.addInitScript(
  ({ serviceId, ids }) => {
    if (localStorage.getItem("govbb-editor:workspace:v1")) return;

    const documents = ids.map((id, index) => {
      const prefix = `govbb-editor:documents:${id}`;
      const title = ["Entry", "Fees", "Contact"][index];

      const keys = {
        committed: `${prefix}:markdown`,
        working: `${prefix}:working`,
        previous: `${prefix}:previous`,
        legacy: `${prefix}:legacy`,
      };

      localStorage.setItem(
        keys.committed,
        `---\ntitle: ${title}\n---\n\nExisting ${title} content.\n`,
      );

      return { id, kind: "page", role: "supporting", title, keys };
    });

    localStorage.setItem(
      "govbb-editor:workspace:v1",
      JSON.stringify({
        version: 1,
        services: [{ id: serviceId, title: "Routing service", documents }],
      }),
    );
  },
  { serviceId, ids },
);

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const navigation = page.getByRole("navigation", { name: "Service documents" });

const saved = () => page.locator('[role="status"][title="Saved"]:visible').waitFor();

async function historyMove(delta, expected) {
  await Promise.all([
    page.waitForEvent("framenavigated"),
    page.evaluate((delta) => history.go(delta), delta),
  ]);
  await page.waitForURL(expected, { timeout: 3000 });
}

try {
  await page.goto(url(ids[0]));
  await title.waitFor();
  assert.equal(await title.inputValue(), "Entry");
  await page.reload();
  await title.waitFor();
  assert.equal(await title.inputValue(), "Entry");
  await page.goto(new URL(`/#${path(ids[0])}`, base).href);
  await title.waitFor();
  assert.equal(page.url(), url(ids[0]));

  const bytes = await page.evaluate(() => JSON.stringify(localStorage));
  await page.goto(new URL(`${path("missing")}`, base).href);
  await page.getByRole("heading", { name: "Document not found" }).waitFor();
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), bytes);
  await page.goto(new URL(`${path(ids[0])}/extra`, base).href);
  await page.getByRole("heading", { name: "Page not found" }).waitFor();
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), bytes);
  await page.goto(new URL("/#/services/%E0%A4%A", base).href);
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/services");

  const services = page.getByRole("region", { name: "Services" });
  const rows = services.locator("tbody tr");
  await services.getByText("Get a copy of a birth certificate", { exact: true }).waitFor();
  assert.equal(await rows.count(), 3);
  const search = page.getByRole("searchbox", { name: "Search services" });
  await search.fill("birth-certificate");
  assert.equal(await rows.count(), 1);
  await search.fill("");
  const serviceHeader = services.getByRole("columnheader", { name: /^Service/ });
  assert.equal(await serviceHeader.getAttribute("aria-sort"), "ascending");
  await serviceHeader.getByRole("button").click();
  assert.equal(await serviceHeader.getAttribute("aria-sort"), "descending");
  assert.match(await rows.first().innerText(), /^What prescription colours mean/);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Category" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await services.getByRole("columnheader", { name: /^Category/ }).count(), 0);
  await page.getByRole("heading", { name: "Drafts in this browser" }).waitFor();

  await page.goto(url(ids[0]));
  await page.getByRole("link", { name: "Services", exact: true }).click();
  await page.getByRole("link", { name: /Routing service/ }).click();
  await page.waitForURL(url(ids[0]));
  await navigation.getByRole("link", { name: "Fees", exact: true }).click();
  await page.waitForURL(url(ids[1]));
  await navigation.getByRole("link", { name: "Contact", exact: true }).click();
  await page.waitForURL(url(ids[2]));
  await historyMove(-1, url(ids[1]));
  await saved();

  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("govbb-editor:documents:fees:"))
        throw new DOMException("Storage quota reached", "QuotaExceededError");

      return window.originalSetItem.call(this, key, value);
    };
  });
  await title.fill("Unstored fee changes");
  await page.getByText("Not saved", { exact: true }).waitFor();
  const historyLength = await page.evaluate(() => history.length);

  await page.getByRole("link", { name: "Services", exact: true }).click();
  await page.getByText("Save or download this draft before leaving it. Then try again.").waitFor();
  assert.equal(page.url(), url(ids[1]));
  await historyMove(-1, url(ids[1]));
  await historyMove(1, url(ids[1]));
  await historyMove(-2, url(ids[1]));
  assert.equal(await title.inputValue(), "Unstored fee changes");
  assert.equal(await page.evaluate(() => history.length), historyLength);

  const leaving = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const dialog = await leaving;
  assert.equal(dialog.type(), "beforeunload");
  await dialog.dismiss();
  assert.equal(await title.inputValue(), "Unstored fee changes");

  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await navigation.getByRole("link", { name: "Contact", exact: true }).click();
  await page.waitForURL(url(ids[2]));
  await navigation.getByRole("link", { name: "Unstored fee changes", exact: true }).click();
  await page.waitForURL(url(ids[1]));
  await saved();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await title.inputValue(), "Fees");
  await saved();

  const other = await context.newPage();
  await other.goto(new URL("/services", base).href);
  await other.evaluate(() =>
    localStorage.setItem(
      "govbb-editor:documents:fees:markdown",
      "---\ntitle: Other tab\n---\n\nExternal update.\n",
    ),
  );
  await page.getByRole("button", { name: "Load other tab’s version", exact: true }).waitFor();
  await historyMove(-1, url(ids[1]));
  await page
    .getByText("Resolve this draft's conflict or interrupted import before leaving it.")
    .waitFor();
  assert.equal(page.url(), url(ids[1]));
  await other.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS typed routes, legacy links, encoded IDs, not-found recovery, blocked links/back/forward/multi-entry history, conflicts and undo",
  );
} finally {
  await browser.close();
}
