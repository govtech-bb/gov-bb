import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = process.argv[2] ?? "http://localhost:3015/";

const key = "govbb-editor:draft:markdown:v2",
  working = "govbb-editor:draft:markdown:working";

const root = page.locator('[aria-label="Form"]');

const source = page.getByRole("textbox", { name: "Markdown source", exact: true });

const open = async () => {
  await page.getByRole("button", { name: /^Markdown/ }).click();
  await source.waitFor();
};

const close = async () => {
  const button = page.getByRole("button", { name: "Close source", exact: true });

  if (await button.count()) await button.click();
};

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await root.waitFor();
  await page.waitForFunction((key) => localStorage.getItem(key)?.includes("formatVersion: 2"), key);
  await open();
  const original = await source.inputValue();
  assert.match(original, /::text\[Event name\]/);
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), original);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download source", exact: true }).click();
  const saved = await download;
  await saved.saveAs("/tmp/lexical-source-ui.md");
  assert.equal(await readFile("/tmp/lexical-source-ui.md", "utf8"), original);
  const edited = original.replace("# Tell us about the event", "# Source-edited page");
  await source.fill(edited);
  assert.equal(await root.getAttribute("contenteditable"), "false");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await close();
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Source-edited page",
  );
  await root.locator("[data-page-title] [data-text]").first().click();
  await page.keyboard.press("Meta+z");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-page-title] [data-text]")?.textContent ===
      "Tell us about the event",
  );
  await page.keyboard.press("Meta+Shift+z");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-page-title] [data-text]")?.textContent === "Source-edited page",
  );
  await open();
  await source.fill("unclosed broken source");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  assert.equal(await source.inputValue(), "unclosed broken source");
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Source-edited page",
  );
  assert.ok(await page.getByRole("button", { name: /^Line 1:/ }).count());
  await page.reload();
  await open();
  assert.equal(await source.inputValue(), "unclosed broken source");
  assert.equal(await root.getAttribute("contenteditable"), "false");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  assert.match(await source.inputValue(), /# Source-edited page/);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), working), null);
  const imported = (await source.inputValue()).replace("# Source-edited page", "# Imported page");
  await page
    .getByLabel("Open Markdown file", { exact: true })
    .setInputFiles({ name: "edited.md", mimeType: "text/markdown", buffer: Buffer.from(imported) });
  await page.getByText("edited.md is ready to apply", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await close();
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Imported page",
  );
  const other = await context.newPage();
  await other.goto(url);
  await other.locator('[aria-label="Form"]').waitFor();
  await other.getByRole("button", { name: /^Markdown/ }).click();
  const theirs = other.getByRole("textbox", { name: "Markdown source", exact: true });
  await theirs.fill((await theirs.inputValue()).replace("# Imported page", "# Other tab page"));
  await other.getByRole("button", { name: "Apply changes", exact: true }).click();
  await page.getByRole("button", { name: "Load other tab’s version", exact: true }).waitFor();
  await page.getByRole("button", { name: "Load other tab’s version", exact: true }).click();
  await close();
  assert.equal(
    await root.locator("[data-page-title] [data-text]").first().textContent(),
    "Other tab page",
  );
  await other.close();
  await page.evaluate((key) => localStorage.setItem(key, ""), key);
  await page.reload();
  await source.waitFor();
  assert.equal(await source.inputValue(), "");
  assert.equal(await root.count(), 0);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), "");
  await source.fill(original);
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await close();
  await root.waitFor();
  await page.evaluate(() => {
    window.__draftOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "govbb-editor:draft:markdown:v2")
        throw new DOMException("Storage quota reached", "QuotaExceededError");

      return window.__draftOriginalSetItem.call(this, key, value);
    };
  });
  await root.locator("[data-page-title] [data-text]").first().fill("Unsaved quota page");
  await page.getByText("Not saved", { exact: true }).waitFor();
  await open();
  assert.match(await source.inputValue(), /# Unsaved quota page/);
  await page.getByText(/Not saved: Storage quota reached/).waitFor();
  await page.evaluate(() => (Storage.prototype.setItem = window.__draftOriginalSetItem));
  await page.getByRole("button", { name: "Try saving again", exact: true }).click();
  await page.getByText("Saved in this browser", { exact: true }).waitFor();
  await close();
  assert.match(
    await page.evaluate((key) => localStorage.getItem(key), key),
    /# Unsaved quota page/,
  );

  const legacyBytes = await readFile(
    new URL("./fixtures/legacy-step9.json", import.meta.url),
    "utf8",
  );

  const legacyContext = await browser.newContext();
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(url);
  await legacyPage.evaluate((bytes) => {
    localStorage.clear();
    localStorage.setItem("govbb-editor:draft", bytes);
  }, legacyBytes);
  await legacyPage.reload();
  await legacyPage.locator('[aria-label="Form"]').waitFor();
  await legacyPage.waitForFunction(
    (key) => localStorage.getItem(key)?.includes("formatVersion: 2"),
    key,
  );
  assert.equal(
    await legacyPage.evaluate(() => localStorage.getItem("govbb-editor:draft")),
    legacyBytes,
  );
  assert.equal(await legacyPage.locator("[data-page-title]").count(), 4);
  await legacyContext.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "/tmp/lexical-source-ui-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS Markdown copy/download, atomic Apply, undo/redo, parse recovery, dirty reload, Discard, file import, tab conflict, empty-source recovery and mobile source layout",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/lexical-source-ui-failure.png" });
  console.error((await page.locator("body").innerText()).slice(0, 4000));
  throw error;
} finally {
  await browser.close();
}
