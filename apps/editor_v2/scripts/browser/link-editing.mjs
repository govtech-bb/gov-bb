import { authenticatedContext } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const button = (name) => page.getByRole("button", { name, exact: true });

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const link = page.getByRole("textbox", { name: "Link", exact: true });

async function editLink() {
  await body.locator("p").selectText();
  await page.keyboard.press("ControlOrMeta+k");
  await link.waitFor();
}

async function savedSource() {
  await page.getByRole("button", { name: /^Markdown/ }).click();

  const value = await page
    .getByRole("textbox", { name: "Markdown source", exact: true })
    .inputValue();

  await button("Close source").click();

  return value;
}

try {
  await page.goto(process.argv[2] ?? "http://localhost:3015/");
  await page.getByRole("textbox", { name: "Form", exact: true }).waitFor();
  await button("Create service").click();
  await page.getByLabel("Service name", { exact: true }).fill("Link editing checks");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create service", exact: true })
    .click();
  await body.waitFor();
  await body.fill("Read the guidance");

  for (const destination of [
    "/guidance",
    "#eligibility",
    "mailto:help@example.gov.bb",
    "tel:+12465350000",
    "https://example.gov.bb/guidance",
  ]) {
    await editLink();
    await link.fill(destination);
    await button("Apply").click();
    await link.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    assert.equal(await body.locator("a").getAttribute("href"), destination);
    await savedSource();
    await page.reload();
    await body.waitFor();
    assert.equal(await body.locator("a").getAttribute("href"), destination);
  }

  const before = await savedSource();
  const original = await body.locator("a").getAttribute("href");
  await page.setViewportSize({ width: 390, height: 844 });
  await editLink();

  for (const destination of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.gov.bb",
    "",
  ]) {
    await link.fill(destination);
    await button("Apply").click();
    await page.getByRole("alert").waitFor();
    assert.equal(await link.getAttribute("aria-invalid"), "true");
    assert.equal(await body.locator("a").getAttribute("href"), original);
  }

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await link.fill("../before-you-start");
  assert.equal(await link.getAttribute("aria-invalid"), "false");
  await button("Apply").click();
  await link.waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  assert.equal(await body.locator("a").getAttribute("href"), "../before-you-start");
  await button("Undo").click();
  assert.equal(await savedSource(), before);
  await button("Redo").click();
  assert.ok((await savedSource()).includes("../before-you-start"));
  await page.reload();
  await body.waitFor();
  assert.equal(await body.locator("a").getAttribute("href"), "../before-you-start");
  assert.deepEqual(errors, []);
  console.log(
    "PASS link editing: relative and supported addresses, rejected destinations, retry, source preservation, undo/redo, reload and mobile",
  );
} finally {
  await browser.close();
}
