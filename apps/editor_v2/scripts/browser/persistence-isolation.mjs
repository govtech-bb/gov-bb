import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "editor-memory-"));

let browser;

try {
  const bundle = join(directory, "memory.js");
  await buildBrowserFixture("tests/browser/persistence.tsx", bundle);
  browser = await chromium.launch();

  const page = await browser.newPage(),
    errors = [];

  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://in-memory.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><main id="app"></main></body></html>',
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("govbb-editor:workspace:v1", "{malformed");
    localStorage.setItem("govbb-editor:draft:markdown:v2", "Conflicting draft");
    localStorage.setItem("govbb-editor:documents:First:server", "{invalid baseline");
    localStorage.setItem("govbb-editor:draft:replacement", "{invalid journal");
    window.draftStorageCalls = [];

    for (const method of ["getItem", "setItem", "removeItem", "clear"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.draftStorageCalls.push([method, ...args]);

        return original.apply(this, args);
      };
    }
  });
  await page.goto("https://in-memory.test/");
  const oldBytes = await page.evaluate(() => JSON.stringify(localStorage));
  await page.addScriptTag({ path: bundle });
  await page.getByRole("textbox", { name: "First", exact: true }).waitFor();

  const snapshot = (name) =>
    page.evaluate((name) => window.persistenceFixture.snapshot(name), name);

  const original = await snapshot("Second");
  await page.evaluate(() => {
    window.persistenceFixture.write("First", "In-memory edit");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "First:saved", newValue: "other tab" }),
    );
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.match((await snapshot("First")).committed, /In-memory edit/);
  assert.deepEqual(await snapshot("Second"), original);
  await page.evaluate(() => window.persistenceFixture.edit("First", "{invalid JSON"));
  assert.equal(await page.evaluate(() => window.persistenceFixture.apply("First")), false);
  assert.equal((await snapshot("First")).source, "{invalid JSON");
  assert.equal(await page.evaluate(() => window.persistenceFixture.editable("First")), false);
  await page.evaluate(() => window.persistenceFixture.discard("First"));
  assert.equal(await page.evaluate(() => window.persistenceFixture.editable("First")), true);
  const detached = await snapshot("First");
  await page.getByRole("button", { name: "Unmount first" }).click();
  await page.getByRole("textbox", { name: "First", exact: true }).waitFor({ state: "detached" });
  await page.evaluate(() => {
    window.persistenceFixture.write("Second", "Remaining editor");
    window.persistenceFixture.write("Without source binding", "Independent canvas");
    window.dispatchEvent(new Event("pagehide"));
  });
  assert.deepEqual(await snapshot("First"), detached);
  assert.match((await snapshot("Second")).committed, /Remaining editor/);
  assert.equal(
    await page.evaluate(() => window.persistenceFixture.text("Without source binding")),
    "Independent canvas",
  );
  assert.deepEqual(await page.evaluate(() => window.draftStorageCalls), []);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), oldBytes);
  assert.deepEqual(errors, []);
  console.log(
    "PASS independent in-memory editors, atomic source Apply/Discard, inert old drafts, no storage reads/writes on editing or lifecycle events",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
