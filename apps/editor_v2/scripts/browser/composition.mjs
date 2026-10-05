import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-composition-"));

const bundle = join(directory, "composition.js");

let browser;

try {
  await buildBrowserFixture("tests/browser/composition.tsx", bundle);
  browser = await chromium.launch();

  for (const modifier of ["Meta", "Control"]) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });

    const page = await context.newPage(),
      errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      '<!doctype html><html><head><style>body{font-family:sans-serif;padding:20px}section{padding:20px;border:1px solid #888;margin:20px 0}[contenteditable]{min-height:45px;border:1px solid #bbb;padding:10px}button,input{margin:5px}</style></head><body tabindex="-1"><main id="app"></main><aside id="portals"></aside></body></html>',
    );
    await page.addScriptTag({ path: bundle });
    await page.getByRole("textbox", { name: "Second", exact: true }).waitFor();
    await page.waitForFunction(() => window.compositionFixture?.hooks() === 2);
    const text = (name) => page.evaluate((name) => window.compositionFixture.text(name), name);
    const bodyFocus = () => page.evaluate(() => document.body.focus());

    const undo = async () => {
      await page.keyboard.press(`${modifier}+z`);
      await page.waitForTimeout(30);
    };

    const redo = async () => {
      await page.keyboard.press(modifier === "Meta" ? "Meta+Shift+z" : "Control+y");
      await page.waitForTimeout(30);
    };

    assert.deepEqual(
      await page.evaluate(() => window.compositionFixture.state("First")),
      await page.evaluate(() => window.compositionFixture.headlessState()),
      "live and isolated construction use the same content definition",
    );
    assert.equal(
      await page.evaluate(() => window.compositionFixture.documentKeyListeners()),
      1,
      "two editors share one routed document listener",
    );

    await page.getByRole("button", { name: "First edit", exact: true }).click();
    await page.getByRole("button", { name: "Second edit", exact: true }).click();
    await page.getByRole("button", { name: "First edit", exact: true }).click();
    await page.getByRole("button", { name: "Second edit", exact: true }).click();
    assert.equal(await text("First"), "First edit 2");
    assert.equal(await text("Second"), "Second edit 2");
    await bodyFocus();
    await undo();
    assert.equal(await text("First"), "First edit 2");
    assert.equal(
      await text("Second"),
      "Second edit 1",
      "body undo belongs to the last active editor",
    );
    await redo();
    assert.equal(await text("Second"), "Second edit 2");

    await page.getByTestId("First-portal").click();
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
      "First-portal",
    );
    await undo();
    assert.equal(
      await text("First"),
      "First edit 2",
      "focused portal button routes undo to its React editor owner",
    );
    assert.equal(await text("Second"), "Second edit 2");

    const native = page.getByRole("textbox", { name: "Second native input", exact: true });
    await native.click();
    await native.pressSequentially("native text");
    await undo();
    assert.equal(await text("First"), "First edit 2");
    assert.equal(
      await text("Second"),
      "Second edit 2",
      "native input undo must not reach editor history",
    );
    assert.equal(
      await page.evaluate(() => window.compositionFixture.nativePrevented),
      false,
      "native input keeps browser default undo",
    );

    if (modifier === (process.platform === "darwin" ? "Meta" : "Control"))
      assert.equal(await native.inputValue(), "");

    await page.getByRole("button", { name: "Toggle Second read-only", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Second"]')?.getAttribute("contenteditable") ===
        "false",
    );
    await bodyFocus();
    await undo();
    assert.equal(
      await text("Second"),
      "Second edit 2",
      "read-only changes take effect without remounting",
    );
    await page.getByRole("button", { name: "Toggle Second read-only", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Second"]')?.getAttribute("contenteditable") === "true",
    );
    await bodyFocus();
    await undo();
    assert.equal(await text("Second"), "Second edit 1");

    await page.getByRole("button", { name: "Unmount Second", exact: true }).click();
    await page.waitForFunction(() => window.compositionFixture.hooks() === 1);
    assert.equal(
      await page.evaluate(() => window.compositionFixture.detachedUndo("Second")),
      false,
      "unmounted editor releases its history commands",
    );
    await bodyFocus();
    await undo();
    assert.equal(
      await text("First"),
      "First edit 2",
      "unmount clears the active owner instead of routing to a different editor",
    );
    await page.getByRole("button", { name: "First focus", exact: true }).click();
    await bodyFocus();
    await undo();
    assert.equal(await text("First"), "First edit 1");
    await page.getByRole("button", { name: "Unmount First", exact: true }).click();
    await page.waitForFunction(() => window.compositionFixture.hooks() === 0);
    assert.equal(
      await page.evaluate(() => window.compositionFixture.documentKeyListeners()),
      0,
      "last unmount removes the document listener",
    );
    assert.equal(await page.evaluate(() => window.compositionFixture.detachedUndo("First")), false);

    await page.getByRole("button", { name: "Mount Second", exact: true }).click();
    await page.waitForFunction(() => window.compositionFixture.hooks() === 1);
    assert.equal(await text("Second"), "", "a new mount gets a fresh document and history");
    await page.getByRole("button", { name: "Second edit", exact: true }).click();
    await bodyFocus();
    await undo();
    assert.equal(await text("Second"), "");
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${modifier}: two-editor isolation, portal/native-input undo, live read-only, unmount/remount cleanup; no browser errors`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
