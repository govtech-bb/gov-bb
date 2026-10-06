import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const old = await readFile(new URL("./fixtures/legacy-markdown-v1.md", import.meta.url), "utf8");

const previous = "govbb-editor:draft:markdown:v1";

const current = "govbb-editor:draft:markdown:v2";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(process.argv[2] ?? "http://localhost:3019/");
  await page.evaluate(
    ({ previous, old }) => {
      localStorage.clear();
      localStorage.setItem(previous, old);
    },
    { previous, current, old },
  );
  await page.reload();
  const root = page.locator('[contenteditable="true"][aria-label="Form"]');
  await root.waitFor();
  await page.waitForFunction(
    (key) => localStorage.getItem(key)?.includes("formatVersion: 2"),
    current,
  );
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), previous), old);
  assert.equal(await page.locator("[data-logic-block]").count(), 1);
  const canonical = await page.evaluate((key) => localStorage.getItem(key), current);
  assert.match(canonical, /SHOW_BLOCKS/);
  await page.reload();
  await root.waitFor();
  assert.equal(await page.locator("[data-logic-block]").count(), 1, "migration is idempotent");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  const source = page.getByLabel("Markdown source", { exact: true });
  const before = await source.inputValue();
  const removed = before.replace(/^:::logic[^\n]*\n[\s\S]*?^:::\s*$/m, "");
  assert.notEqual(removed, before);
  await source.fill(removed);
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await page.waitForFunction((key) => !localStorage.getItem(key)?.includes("SHOW_BLOCKS"), current);
  await page.reload();
  await root.waitFor();
  assert.equal(
    await page.locator("[data-logic-block]").count(),
    0,
    "deleted rules do not return from indentation",
  );
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), previous), old);
  assert.deepEqual(errors, []);
  console.log(
    "PASS version 1 browser upgrade, original bytes retained, idempotent reload and deleted rule stays deleted",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/lexical-logic-migration-failure.png" });
  throw error;
} finally {
  await browser.close();
}
