import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";
import { openDemoForm, seedFormSource, formFixtureUrl } from "./form-fixture.mjs";

const browser = await chromium.launch();

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});

const page = await context.newPage(),
  errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = process.argv[2] ?? "http://localhost:3000/";

const root = page.locator('[aria-label="Form"]');

const source = page.getByRole("textbox", { name: "Markdown source", exact: true });

const button = (name) => page.getByRole("button", { name, exact: true });

const open = async () => {
  await page.getByRole("button", { name: /^Markdown(?:$| —)/ }).click();
  await source.waitFor();
};

const close = () => button("Close source").click();

const discard = async () => {
  await button("Discard changes").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
};

try {
  await openDemoForm(page, url);
  await root.waitFor();
  await open();
  const original = await source.inputValue();
  assert.match(original, /::text\[Event name\]/);
  await button("Copy source").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), original);
  const download = page.waitForEvent("download");
  await button("Download source").click();
  assert.equal(await readFile(await (await download).path(), "utf8"), original);

  await source.fill(original.replace("# Tell us about the event", "# Source-edited page"));
  assert.equal(await root.getAttribute("contenteditable"), "false");
  await button("Apply changes").click();
  await close();
  await root.locator("[data-page-title] [data-text]").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-page-title] [data-text]")?.textContent ===
      "Tell us about the event",
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-page-title] [data-text]")?.textContent === "Source-edited page",
  );
  await open();
  await source.fill("unclosed broken source");
  await button("Apply changes").click();
  assert.equal(await source.inputValue(), "unclosed broken source");
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Source-edited page",
  );
  await page.getByRole("button", { name: /^Line 1:/ }).waitFor();
  await discard();
  assert.match(await source.inputValue(), /# Source-edited page/);

  const imported = (await source.inputValue()).replace("# Source-edited page", "# Imported page");
  await page.getByLabel("Markdown file to replace from", { exact: true }).setInputFiles({
    name: "edited.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(imported),
  });
  await page.getByText("edited.md is ready to apply", { exact: true }).waitFor();
  await button("Apply changes").click();
  await close();
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Imported page",
  );

  await open();
  await page.evaluate(() => {
    window.originalFileText = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve) => {
        window.finishSourceRead = async () => resolve(await window.originalFileText.call(this));
      });
    };
  });
  await page.getByLabel("Markdown file to replace from", { exact: true }).setInputFiles({
    name: "slow.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(original),
  });
  const newer = imported + "\nTyped while the file was reading.\n";
  await source.fill(newer);
  await page.evaluate(async () => {
    await window.finishSourceRead();
    File.prototype.text = window.originalFileText;
  });
  await page.getByText(/The source changed while the file was opening/).waitFor();
  assert.equal(await source.inputValue(), newer);
  await discard();
  await close();

  const other = await context.newPage();
  await openDemoForm(other, url);
  await other.getByRole("textbox", { name: "Form", exact: true }).waitFor();
  assert.equal(
    await other.locator("[data-page-title] [data-text]").first().textContent(),
    "Tell us about the event",
  );
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Imported page",
  );
  await other.close();

  // No recovery on reload: the embedding fixture must explicitly supply any source to reopen.
  await page.reload();
  await root.waitFor();
  await open();
  assert.equal(await source.inputValue(), original);
  await close();
  await seedFormSource(page, "");
  await page.goto(formFixtureUrl(url));
  await source.waitFor();
  assert.equal(await source.inputValue(), "");
  assert.equal(await root.count(), 0);
  await source.fill(original);
  await button("Apply changes").click();
  await root.waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS in-memory Markdown copy/download, Apply/Discard, undo/redo, invalid source, file import/race, independent hosts, no reload recovery and mobile layout",
  );
} finally {
  await browser.close();
}
