import assert from "node:assert/strict";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixturePage, installPageApi } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser);

const page = await context.newPage(),
  errors = [];

page.on("pageerror", (error) => errors.push(error.message));

page.setDefaultTimeout(15000);

const base = new URL(process.argv[2] ?? "http://localhost:3000/");

const service = { ...servicesFixture[0], title: "Routing service" };

const ids = [service.id, "fees", "contact", "fourth"];

const { pages, writes } = await installPageApi(
  context,
  service,
  ids.map((id, index) =>
    fixturePage(id, {
      title: [service.title, "Fees", "Contact", "Fourth"][index],
      parent_id: index ? service.id : null,
    }),
  ),
);

const path = (id) => `/services/${service.id}/${encodeURIComponent(id)}`;

const url = (id) => new URL(path(id), base).href;

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const navigation = page.getByRole("navigation", { name: "Service documents" });

const question = page.getByRole("alertdialog");

const button = (name) => page.getByRole("button", { name, exact: true });

async function historyMove(delta, expected) {
  await page.evaluate((delta) => history.go(delta), delta);
  await page.waitForURL(expected);
}

async function cancelDeparture() {
  await question.waitFor();
  // Base UI applies initial focus after the popup becomes visible, especially in the production build.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="alertdialog"] button')].some(
      (element) => element.textContent === "Cancel" && element === document.activeElement,
    ),
  );
  await question.getByRole("button", { name: "Cancel", exact: true }).click();
  await question.waitFor({ state: "hidden" });
  // Native Back/Forward changes the address provisionally; cancelling restores it.
  await page.waitForURL(url("fees"));
  assert.equal(await title.inputValue(), "Unsaved fees");
}

try {
  await page.goto(url(ids[0]));
  await title.waitFor();
  assert.equal(await title.inputValue(), service.title);
  await page.reload();
  await title.waitFor();
  assert.equal(await title.inputValue(), service.title);
  await page.goto(new URL(`/#${path(ids[0])}`, base).href);
  await title.waitFor();
  assert.equal(page.url(), url(ids[0]));
  await page.goto(url("missing #é"));
  await page.getByRole("heading", { name: "Document not found" }).waitFor();
  await page.goto(new URL(path(ids[0]) + "/extra", base).href);
  await page.getByRole("heading", { name: "Page not found" }).waitFor();
  await page.goto(new URL("/#/services/%E0%A4%A", base).href);
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();

  const services = page.getByRole("region", { name: "Services" }),
    rows = services.locator("tbody tr");

  await services.getByText("Get a copy of a birth certificate", { exact: true }).waitFor();
  assert.equal(await rows.count(), 3);
  const search = page.getByRole("searchbox", { name: "Search title or URL" });
  await search.fill("birth-certificate");
  assert.equal(await rows.count(), 1);
  await search.fill("");
  const header = services.getByRole("columnheader", { name: /^Service/ });
  await header.getByRole("button").click();
  assert.equal(await header.getAttribute("aria-sort"), "ascending");
  await header.getByRole("button").click();
  assert.equal(await header.getAttribute("aria-sort"), "descending");
  assert.match(await rows.first().innerText(), /^What prescription colours mean/);
  const category = page.getByRole("combobox", { name: "Category", exact: true });
  await category.click();
  await page.getByRole("option", { name: service.category.title, exact: true }).click();
  assert.equal(await rows.count(), 1);
  await category.click();
  await page.getByRole("option", { name: "All categories", exact: true }).click();
  assert.equal(await page.getByText("Drafts in this browser", { exact: true }).count(), 0);

  // Keep the history chain in one document; a full-page goto would test unload instead of router blocking.
  await services.getByRole("link", { name: service.title, exact: true }).click();
  await page.waitForURL(url(ids[0]));
  await navigation.getByRole("link", { name: /Fees/ }).click();
  await page.waitForURL(url("fees"));
  await navigation.getByRole("link", { name: /Contact/ }).click();
  await page.waitForURL(url("contact"));
  await historyMove(-1, url("fees"));
  await page.waitForFunction(() =>
    [...document.querySelectorAll('textarea[aria-label="Page title"]')].some(
      (input) => !input.closest("[hidden]") && input.value === "Fees",
    ),
  );
  await title.fill("Unsaved fees");
  const length = await page.evaluate(() => history.length);
  await page.locator("header").getByRole("link", { name: "Services", exact: true }).click();
  await cancelDeparture();

  for (const delta of [-1, 1, -2]) {
    await page.evaluate((delta) => history.go(delta), delta);
    await cancelDeparture();
  }

  assert.equal(await page.evaluate(() => history.length), length);

  const unloading = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const unload = await unloading;
  assert.equal(unload.type(), "beforeunload");
  await unload.dismiss();
  assert.equal(await title.inputValue(), "Unsaved fees");
  const closing = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const close = await closing;
  assert.equal(close.type(), "beforeunload");
  await close.dismiss();
  assert.equal(page.isClosed(), false);

  // A reload that goes ahead opens the page as the API has it, and offers back the changes this browser kept
  const kept = page.getByText("This browser kept your unsaved changes");
  const reloading = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  await (await reloading).accept();
  await kept.waitFor();
  assert.equal(await title.inputValue(), "Fees");
  await button("Restore changes").click();
  await kept.waitFor({ state: "detached" });
  assert.equal(await title.inputValue(), "Unsaved fees");

  await navigation.getByRole("link", { name: /Contact/ }).click();
  await question.getByRole("button", { name: "Leave without saving", exact: true }).click();
  await page.waitForURL(url("contact"));
  await navigation.getByRole("link", { name: /Fees/ }).click();
  await page.waitForURL(url("fees"));
  assert.equal(await title.inputValue(), "Fees");
  assert.equal(await button("Undo").isDisabled(), true);
  // Given up on leaving, the changes aren't offered back
  assert.equal(await kept.count(), 0);

  for (const [id, label] of [
    ["fourth", "Fourth"],
    [ids[0], "Entry page"],
    ["contact", "Contact"],
  ]) {
    await navigation.getByRole("link", { name: new RegExp(label) }).click();
    await page.waitForURL(url(id));
    await title.waitFor();
    assert.equal(await question.count(), 0);
  }

  assert.equal(await page.locator("main > section[aria-label]").count(), 3);
  await page.reload();
  await title.waitFor();
  assert.equal(await title.inputValue(), "Contact");
  const savedContact = pages.get("contact");
  pages.set("contact", { ...savedContact, version: savedContact.version + 1 });
  await title.fill("Recovered contact");

  const reloadWithRecovery = async () => {
    const reloading = page.waitForEvent("dialog");
    await page.evaluate(() => setTimeout(() => location.reload(), 0));
    await (await reloading).accept();
    await kept.waitFor();
  };

  await reloadWithRecovery();
  await button("Restore changes").click();
  await button("Newer version saved").waitFor();
  await button("Undo").click();
  assert.equal(await title.inputValue(), "Contact");
  assert.equal(await button("Newer version saved").count(), 0);
  await button("Redo").click();
  assert.equal(await title.inputValue(), "Recovered contact");
  await button("Newer version saved").waitFor();
  assert.equal(await button("Save").getAttribute("aria-disabled"), "true");
  await button("Undo").click();
  await title.fill("Fresh contact");
  await button("Save").click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-document-bar]")].some(
      (bar) => !bar.hidden && bar.textContent.includes("Saved"),
    ),
  );
  assert.equal(writes.at(-1).expectedVersion, savedContact.version + 1);
  assert.equal(pages.get("contact").title, "Fresh contact");

  await title.fill("Discardable contact");
  await reloadWithRecovery();
  const discard = button("Discard changes…");
  await discard.focus();
  await page.keyboard.press("Enter");
  await question.waitFor();
  await page.keyboard.press("Escape");
  await question.waitFor({ state: "hidden" });
  assert.equal(await discard.evaluate((node) => node === document.activeElement), true);
  assert.equal(await kept.isVisible(), true);
  await discard.click();
  await question.getByRole("button", { name: "Discard changes", exact: true }).click();
  await question.waitFor({ state: "hidden" });
  await kept.waitFor({ state: "detached" });
  assert.equal(await title.inputValue(), "Fresh contact");
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "H1");
  await page.reload();
  await title.waitFor();
  assert.equal(await kept.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS API routes, legacy links, not-found handling, services table, cancelled links/Back/Forward, unload/close protection, browser recovery, version-safe undo/redo, confirmed discard and clean-view eviction",
  );
} finally {
  await browser.close();
}
