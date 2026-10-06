import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-persistence-"));

const bundle = join(directory, "persistence.js");

let browser;

try {
  await buildBrowserFixture("tests/browser/persistence.tsx", bundle);
  browser = await chromium.launch();

  const page = await browser.newPage(),
    errors = [];

  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<!doctype html><html><body><main id="app"></main></body></html>');
  await page.addScriptTag({ path: bundle });
  await page.getByRole("textbox", { name: "First", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Without storage", exact: true }).waitFor();

  const snapshot = (name) =>
    page.evaluate((name) => window.persistenceFixture.snapshot(name), name);

  const savedText = async (name) =>
    JSON.parse(await page.evaluate((name) => window.persistenceFixture.saved(name), name)).root
      .children[0].children[0].text;

  await page.evaluate(() =>
    window.persistenceFixture.external("First", "First competing document"),
  );
  assert.equal((await snapshot("First")).status, "conflict");
  assert.equal((await snapshot("Second")).status, "saved");
  assert.equal(await savedText("Second"), "Second saved");
  await page.evaluate(() => window.persistenceFixture.keepLocal("First"));
  assert.equal(await savedText("First"), "First saved");

  await page.evaluate(() => {
    window.persistenceFixture.write("First", "Pagehide flush");
    window.dispatchEvent(new Event("pagehide"));
  });
  assert.equal(await savedText("First"), "Pagehide flush");
  await page.evaluate(() => {
    window.persistenceFixture.write("Second", "Visibility flush");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
  });
  assert.equal(await savedText("Second"), "Visibility flush");

  await page.evaluate(() => window.persistenceFixture.write("First", "Unmount flush"));
  await page.getByRole("button", { name: "Unmount first", exact: true }).click();
  await page.getByRole("textbox", { name: "First", exact: true }).waitFor({ state: "detached" });
  assert.equal(await savedText("First"), "Unmount flush");
  const detachedCalls = await page.evaluate(() => window.persistenceFixture.calls("First"));
  await page.evaluate(() => {
    window.persistenceFixture.external("First", "External after unmount");
    window.dispatchEvent(new Event("pagehide"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
  });
  assert.deepEqual(
    await page.evaluate(() => window.persistenceFixture.calls("First")),
    detachedCalls,
  );
  assert.equal((await snapshot("Second")).status, "saved");
  await page.evaluate(() => {
    window.persistenceFixture.write("Without storage", "Independent content");
    window.persistenceFixture.write("Second", "Remaining editor");
    window.dispatchEvent(new Event("pagehide"));
  });
  assert.equal(await savedText("Second"), "Remaining editor");
  assert.equal(
    await page.evaluate(() => window.persistenceFixture.text("Without storage")),
    "Independent content",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS separate draft keys, storage conflicts, pagehide/visibility flush, unmount cleanup, and content editor without storage; no browser errors",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
