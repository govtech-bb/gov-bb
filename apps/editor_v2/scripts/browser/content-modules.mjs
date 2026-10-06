import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-content-modules-"));

const bundle = join(directory, "content.js");

let browser, page;

try {
  await buildBrowserFixture("tests/browser/content-modules.tsx", bundle);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    '<!doctype html><html><head><style>body{font-family:sans-serif;padding:100px 30px}section{padding:25px;border:1px solid #888;margin:60px 0}[contenteditable]{min-height:80px;line-height:1.5;border:1px solid #bbb;padding:10px}button,input{margin:5px}svg{width:20px;height:20px}[data-fold]{display:inline-block;width:20px;height:20px;background:#ddd}[data-text]{min-height:25px}p{min-height:25px}</style></head><body><main id="app"></main></body></html>',
  );
  await page.evaluate(() => {
    window.contentStorageCalls = [];

    for (const method of ["getItem", "setItem", "removeItem"])
      Storage.prototype[method] = function (...args) {
        window.contentStorageCalls.push([method, ...args]);
        throw new Error("Content editor accessed browser draft storage");
      };
  });
  await page.addScriptTag({ path: bundle });
  const first = page.getByRole("textbox", { name: "First", exact: true });
  const second = page.getByRole("textbox", { name: "Second", exact: true });
  await first.waitFor();
  await second.waitFor();
  await page.waitForFunction(() => window.contentFixture?.ready());
  const state = (name) => page.evaluate((name) => window.contentFixture.state(name), name);

  const select = async (name, index = 0) => {
    await page.evaluate(({ name, index }) => window.contentFixture.select(name, index), {
      name,
      index,
    });
    await page.getByRole("textbox", { name, exact: true }).press("Shift");
    await page.waitForTimeout(120);
  };

  const reset = async (value) => {
    await page.keyboard.press("Escape");
    await page.evaluate((value) => window.contentFixture.reset("First", value), value);
    await first.click();
  };

  const initialSecond = await state("Second");
  assert.deepEqual(
    (await state("First")).root.children.map((node) => node.type),
    ["paragraph"],
  );

  await select("First");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  assert.equal(
    (await state("First")).root.children[0].children[0].format & 1,
    1,
    "contributed toolbar applies bold",
  );
  assert.deepEqual(await state("Second"), initialSecond, "formatting belongs to its editor");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Link", exact: true })
    .fill("https://example.test/content");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForFunction(() =>
    window.contentFixture
      .state("First")
      .root.children[0].children.some((node) => node.type === "link"),
  );
  const linked = await state("First");
  assert.equal(linked.root.children[0].children[0].url, "https://example.test/content");
  assert.equal(
    linked.root.children[0].children[0].children[0].format & 1,
    1,
    "link keeps rich formatting",
  );
  assert.deepEqual(
    await page.evaluate((snapshot) => window.contentFixture.validate(snapshot), linked),
    linked,
    "live state reloads through the same content definition",
  );
  await page.evaluate(() => window.contentFixture.reload("First"));
  await page.waitForFunction(
    (expected) =>
      window.contentFixture.ready() &&
      JSON.stringify(window.contentFixture.state("First")) === JSON.stringify(expected),
    linked,
  );
  assert.deepEqual(await state("Second"), initialSecond);

  await select("First");
  await page.getByRole("button", { name: "Edit link", exact: true }).click();
  await page.getByRole("textbox", { name: "Link", exact: true }).waitFor();
  const beforeReadOnly = await state("First");
  await page.evaluate(() => window.contentFixture.setReadOnly(true));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="First"]')?.contentEditable === "false",
  );
  await page.getByRole("textbox", { name: "Link", exact: true }).waitFor({ state: "hidden" });
  assert.equal(
    await page.getByRole("button", { name: "Bold", exact: true }).count(),
    0,
    "open formatting portal closes on read-only",
  );
  assert.deepEqual(await state("First"), beforeReadOnly);
  await page.evaluate(() => window.contentFixture.setReadOnly(false));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="First"]')?.contentEditable === "true",
  );

  await reset("");
  await first.pressSequentially("/Heading 2", { delay: 25 });
  await page.getByRole("option", { name: /Heading 2/ }).waitFor();
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    window.contentFixture.state("First").root.children.some((node) => node.type === "heading"),
  );
  const inserted = await state("First");
  assert.equal(
    inserted.root.children[0].tag,
    "h2",
    `generic slash menu uses installed heading action: ${JSON.stringify(inserted)}`,
  );
  await first.pressSequentially("Section");
  await page.keyboard.press("Enter");
  await first.pressSequentially("Body");
  await page.waitForFunction(() => window.contentFixture.text("First").includes("Body"));
  assert.deepEqual(
    (await state("First")).root.children.map((node) => node.type),
    ["heading", "paragraph"],
    "heading Enter continues as body text",
  );

  await reset("");
  await first.pressSequentially("- ");
  await page.waitForFunction(
    () => window.contentFixture.state("First").root.children[0].type === "bullet",
  );
  await first.pressSequentially("First item");
  await page.keyboard.press("Enter");
  await first.pressSequentially("Second item");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  assert.deepEqual(
    (await state("First")).root.children.map((node) => node.type),
    ["bullet", "bullet", "paragraph"],
    "list Enter creates items and exits the empty item",
  );
  await page.evaluate(() => window.contentFixture.insert("First", "WARNING_TEXT"));
  await first.pressSequentially("Keep this warning");
  await page.evaluate(() => window.contentFixture.caret("First", -1));
  await page.waitForTimeout(30);
  await page.keyboard.press("Backspace");
  await page.waitForFunction(
    () => window.contentFixture.state("First").root.children.at(-1).type === "paragraph",
  );
  assert.match(await page.evaluate(() => window.contentFixture.text("First")), /Keep this warning/);

  await reset("");
  const empty = await state("First");
  await page.evaluate(() => window.contentFixture.insert("First", "SHOW_HIDE"));
  const disclosure = await state("First");
  assert.deepEqual(
    disclosure.root.children.map((node) => node.type),
    ["show-hide", "paragraph"],
  );
  await page.keyboard.press("Meta+z");
  await page.waitForFunction(
    (expected) =>
      window.contentFixture.ready() &&
      JSON.stringify(window.contentFixture.state("First")) === JSON.stringify(expected),
    empty,
  );
  await page.keyboard.press("Meta+Shift+z");
  await page.waitForFunction(
    (expected) =>
      window.contentFixture.ready() &&
      JSON.stringify(window.contentFixture.state("First")) === JSON.stringify(expected),
    disclosure,
  );
  await first.pressSequentially("Extra help");
  await select("First");
  assert.equal(
    await page.getByRole("button", { name: "Bold", exact: true }).count(),
    0,
    "disclosure summary does not offer rich formatting",
  );
  await first.press("ArrowRight");
  await first.press("ArrowDown");
  await first.locator(":scope > p").click();
  await first.pressSequentially("Useful details");
  const body = first.locator(":scope > p").last();
  await first.locator("[data-fold]").click();
  await body.waitFor({ state: "hidden" });
  await first.locator("[data-fold]").click();
  await body.waitFor({ state: "visible" });
  const unfolded = await state("First");
  await page.evaluate(() => window.contentFixture.setReadOnly(true));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="First"]')?.contentEditable === "false",
  );
  await first.locator("[data-fold]").click();
  assert.deepEqual(
    await state("First"),
    unfolded,
    "read-only disclosure click cannot save a folded state",
  );
  await page.evaluate(() => window.contentFixture.setReadOnly(false));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="First"]')?.contentEditable === "true",
  );
  await reset("# ");
  await page.evaluate(() => window.contentFixture.setReadOnly(true));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="First"]')?.contentEditable === "false",
  );
  const beforeShortcut = await state("First");
  await first.dispatchEvent("keyup", { key: " " });
  await page.waitForTimeout(50);
  assert.deepEqual(
    await state("First"),
    beforeShortcut,
    "read-only keyup cannot run a content shortcut",
  );
  assert.deepEqual(
    await state("Second"),
    initialSecond,
    "all First editing and reload leaves Second unchanged",
  );
  assert.deepEqual(
    await page.evaluate(() => window.contentStorageCalls),
    [],
    "content-only editor never touches form draft storage",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS content-only: installed slash/toolbar, bold/link/reload, headings/lists/callouts/disclosure, exact undo/redo, editor isolation, live read-only and no storage access",
  );
  await context.close();
} catch (error) {
  if (page)
    console.error(
      await page
        .evaluate(() => ({
          state: window.contentFixture?.state("First"),
          selection: window.getSelection()?.toString(),
          body: document.body.innerText,
        }))
        .catch(() => null),
    );
  throw error;
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
