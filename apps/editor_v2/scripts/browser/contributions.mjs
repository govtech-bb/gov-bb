import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-contributions-"));

const bundle = join(directory, "contributions.js");

let browser;

try {
  await buildBrowserFixture("tests/browser/contributions.tsx", bundle);
  browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } }),
    errors = [];

  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    '<!doctype html><html><head><style>body{font-family:sans-serif;padding:20px}section{padding:20px;border:1px solid #888;margin:20px 0}[contenteditable]{min-height:45px;border:1px solid #bbb;padding:10px}[role=listbox]{background:white;border:1px solid #aaa;padding:10px}[role=option]{padding:10px;cursor:pointer}[role=dialog]{position:fixed;inset:10% 15%;background:white;border:2px solid black;padding:20px;overflow:auto;z-index:100}button,input{margin:5px}</style></head><body><main id="app"></main></body></html>',
  );
  await page.addScriptTag({ path: bundle });
  const first = page.getByRole("textbox", { name: "First", exact: true });
  await first.waitFor();
  assert.equal(
    await page.getByTestId("First-inspector").innerText(),
    "First inspector: owned controls",
  );
  assert.equal(
    await page.getByTestId("Second-inspector").innerText(),
    "Second inspector: owned controls",
  );
  await first.click();
  await page.keyboard.type("/outside");
  await page
    .locator('#typeahead-menu [role="option"]')
    .filter({ hasText: "Test contribution" })
    .waitFor();
  await page.keyboard.press("Enter");
  await page.getByTestId("First-renderer").waitFor();
  assert.equal(
    await page.evaluate(() => window.contributionsFixture.completions("First")),
    1,
    "slash completion result is available synchronously in Lexical's update",
  );
  assert.equal(
    await page.locator('#typeahead-menu [role="option"]').count(),
    0,
    "successful slash action closes its menu",
  );
  assert.equal(
    await page.getByTestId("First-renderer").innerText(),
    "First renderer: Shared storage kind",
  );
  assert.equal(await page.getByTestId("Second-renderer").count(), 0);

  await page.getByRole("button", { name: "Open Second insertion", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.waitFor();
  assert.equal(await modal.getByTestId("extension-preview").innerText(), "Second preview");
  await modal.getByRole("option", { name: "Test contribution", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => window.contributionsFixture.completions("Second")), 1);
  assert.equal(
    await page.getByTestId("Second-renderer").innerText(),
    "Second renderer: Shared storage kind",
  );
  assert.equal(
    await page.getByTestId("First-renderer").innerText(),
    "First renderer: Shared storage kind",
  );
  const firstState = await page.evaluate(() => window.contributionsFixture.state("First"));
  assert.equal(
    firstState.root.children.filter((node) => node.type === "extension-proof").length,
    1,
  );
  const secondState = await page.evaluate(() => window.contributionsFixture.state("Second"));
  assert.equal(
    secondState.root.children.filter((node) => node.type === "extension-proof").length,
    1,
  );

  await page.getByRole("button", { name: "Open Second insertion", exact: true }).click();
  await modal.waitFor();
  await page.evaluate(() => window.contributionsFixture.replaceTarget("Second"));
  const replacement = await page.evaluate(() => window.contributionsFixture.state("Second"));
  await modal.getByRole("option", { name: "Test contribution", exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() => window.contributionsFixture.state("Second")),
    replacement,
    "a stale modal target refuses without modifying its replacement",
  );
  assert.equal(await modal.isVisible(), true);
  assert.deepEqual(
    await page.evaluate(() => window.contributionsFixture.state("First")),
    firstState,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS contributed action in slash/modal, feature preview/inspector slots, real decorator rendering isolated across editors, stale modal target; no browser errors",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
