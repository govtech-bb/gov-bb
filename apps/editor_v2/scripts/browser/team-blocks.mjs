import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const root = page.locator('[contenteditable="true"][aria-label="Form"]');

const menu = async () => {
  const label = root
    .locator("h2")
    .filter({ hasText: "National Identification (ID) number" })
    .first();

  await label.scrollIntoViewIfNeeded();
  await label.hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
};

const format = async () => {
  await menu();
  await page.getByRole("menuitem", { name: /^Format/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByLabel("Validation pattern", { exact: true }).waitFor();
};

const close = async () => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
};

const saved = async () =>
  page.waitForFunction(() => {
    const text = localStorage.getItem("govbb-editor:draft:markdown:v2");

    return text?.includes("AA999999") && text.includes("[A-Z]{2}");
  });

try {
  await page.goto(process.argv[2] ?? "http://localhost:3019/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await root.waitFor();
  await format();
  const pattern = page.getByLabel("Validation pattern", { exact: true });
  await pattern.fill("^[A-Z]{2}[0-9]{6}$");
  await page.getByLabel("Input mask", { exact: true }).fill("AA999999");
  await pattern.fill("[");
  await page
    .getByText("Enter a valid regular expression, or clear the pattern.", { exact: false })
    .waitFor();
  assert.equal(await pattern.getAttribute("aria-invalid"), "true");
  await saved();
  await close();
  await page.reload();
  await root.waitFor();
  await format();
  assert.equal(
    await page.getByLabel("Validation pattern", { exact: true }).inputValue(),
    "^[A-Z]{2}[0-9]{6}$",
  );
  assert.equal(await page.getByLabel("Input mask", { exact: true }).inputValue(), "AA999999");
  await page.getByLabel("Validation pattern", { exact: true }).fill("");
  await page.getByLabel("Input mask", { exact: true }).fill("");
  await close();
  await page.waitForFunction(() => {
    const text = localStorage.getItem("govbb-editor:draft:markdown:v2");

    return text?.includes('"removeSettings"') && !text.includes("AA999999");
  });
  await page.reload();
  await root.waitFor();
  await format();
  assert.equal(await page.getByLabel("Validation pattern", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("Input mask", { exact: true }).inputValue(), "");
  await close();
  await menu();
  assert.match(await page.getByRole("menu").first().innerText(), /Based on/);
  assert.match(await page.getByRole("menu").first().innerText(), /An editable copy/);
  await page.screenshot({ path: "/tmp/govbb-editor-team-blocks.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS editable copied formats, keyboard submenu, invalid pattern retention, removed defaults, reload and provenance",
  );
} catch (error) {
  console.log((await page.locator("body").innerText()).slice(-10000));
  await page.screenshot({ path: "/tmp/govbb-editor-team-blocks-failure.png" });
  throw error;
} finally {
  await browser.close();
}
