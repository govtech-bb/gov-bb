import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-logic-modules-"));

const bundle = join(directory, "logic.js");

let browser, page;

try {
  await buildBrowserFixture("tests/browser/logic-modules.tsx", bundle);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error);
  });
  await page.route("https://logic-modules.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><style>body{font-family:sans-serif;padding:30px}section[data-fixture]{position:relative;padding:25px;border:1px solid #888;margin:40px 0}[contenteditable]{min-height:45px;line-height:1.5;border:1px solid #bbb;padding:10px}button,input{margin:5px}svg{width:20px;height:20px}[data-logic-block]{margin:12px 0}[data-logic-editor-root]{position:relative}p{min-height:25px}[role=listbox],[role=menu]{background:white;border:1px solid #888;padding:10px}</style></head><body><main id="app"></main></body></html>',
    }),
  );
  await page.goto("https://logic-modules.test/");
  await page.addScriptTag({ path: bundle });

  const first = page.locator('[data-fixture="First"]'),
    second = page.locator('[data-fixture="Second"]');

  await page.waitForFunction(() => window.logicModulesFixture?.ready());
  const state = (name) => page.evaluate((name) => window.logicModulesFixture.state(name), name);
  const source = (name) => page.evaluate((name) => window.logicModulesFixture.source(name), name);

  const readOnly = async (value) => {
    await page.evaluate((value) => window.logicModulesFixture.readOnly("First", value), value);
    await page.waitForFunction(
      (value) =>
        document.querySelector('[aria-label="First form"]').contentEditable === String(!value),
      value,
    );
  };

  const unchanged = async (snapshot, saved) => {
    assert.deepEqual(
      await state("First"),
      snapshot,
      "read-only interaction preserves the serialized document",
    );
    assert.equal(
      await source("First"),
      saved,
      "read-only interaction preserves canonical saved bytes",
    );
  };

  const secondInitial = await state("Second");
  await first.getByRole("button", { name: "Edit formula", exact: true }).click();
  const formula = page.getByRole("textbox", { name: "Edit formula", exact: true });
  await formula.waitFor();
  await formula.fill("2 + 3");
  await page.waitForFunction(
    () =>
      window.logicModulesFixture
        .state("First")
        .root.children.find((node) => node.widget === "conditional-logic")
        .$?.settings.actions[0].calculate.expression.replace(/\s/g, "") === "2+3",
  );
  assert.deepEqual(
    await state("Second"),
    secondInitial,
    "nested formula editing belongs to its editor",
  );

  const formulaState = await state("First"),
    formulaSource = await source("First");

  await readOnly(true);
  await formula.waitFor({ state: "hidden" });
  await first.getByRole("button", { name: "Edit formula", exact: true }).click();
  assert.equal(await formula.count(), 0, "a readonly formula cannot reopen its nested editor");
  await unchanged(formulaState, formulaSource);
  await readOnly(false);
  assert.equal(
    await formula.count(),
    0,
    "reenabling editing does not reopen a stale formula editor",
  );

  const mention = first.getByText("@Speaker count", { exact: true });
  await mention.click();
  const fallback = page.getByRole("textbox", { name: "Default value", exact: true });
  await fallback.waitFor();
  await fallback.fill("Not provided");
  await page.waitForFunction(() =>
    JSON.stringify(window.logicModulesFixture.state("First")).includes(
      '"defaultValue":"Not provided"',
    ),
  );

  const mentionState = await state("First"),
    mentionSource = await source("First");

  await readOnly(true);
  await fallback.waitFor({ state: "hidden" });
  await mention.click();
  assert.equal(await fallback.count(), 0, "a readonly mention does not open writable settings");
  await unchanged(mentionState, mentionSource);
  await readOnly(false);
  assert.equal(
    await fallback.count(),
    0,
    "reenabling editing does not reopen stale mention settings",
  );

  const answer = first
    .getByRole("textbox", { name: "First form", exact: true })
    .locator(":scope > p")
    .filter({ hasText: /^Answer: / })
    .last();

  await answer.click();
  await page.keyboard.press("End");
  await page.keyboard.type("@");
  const suggested = page.getByRole("option", { name: "Speaker count", exact: true });
  await suggested.waitFor();

  const menuState = await state("First"),
    menuSource = await source("First");

  await readOnly(true);
  await suggested.waitFor({ state: "hidden" });
  await unchanged(menuState, menuSource);
  assert.deepEqual(await state("Second"), secondInitial);

  await page.getByRole("button", { name: "Unmount first form", exact: true }).click();
  await first.waitFor({ state: "detached" });
  await second.getByRole("button", { name: "Edit formula", exact: true }).click();
  await formula.waitFor();
  await formula.fill("4 + 5");
  await page.waitForFunction(
    () =>
      window.logicModulesFixture
        .state("Second")
        .root.children.find((node) => node.widget === "conditional-logic")
        .$?.settings.actions[0].calculate.expression.replace(/\s/g, "") === "4+5",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS formula and mention controls close on readonly; canonical bytes preserved; typeahead closes; editors and unmount stay independent; no browser errors",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    console.error((await page.locator("body").innerText()).slice(-7000));
    await page.screenshot({ path: "/tmp/logic-modules-readonly-failure.png" });
  }

  throw error;
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
