import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-external-")),
  bundle = join(directory, "external.js");

let browser, page;

try {
  await buildBrowserFixture("tests/browser/external-extensions.tsx", bundle);

  const css = await readFile(join(directory, "fixture.css"), "utf8");

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1700, height: 1200 } });
  page = await context.newPage();
  await page.addInitScript(() => {
    const tracked = new Map();

    for (const [name, target, types] of [
      ["window", window, ["storage", "pagehide"]],
      ["document", document, ["keydown", "visibilitychange"]],
    ]) {
      const add = target.addEventListener.bind(target),
        remove = target.removeEventListener.bind(target);

      target.addEventListener = (type, callback, options) => {
        if (types.includes(type)) {
          const key = `${name}:${type}`,
            members = tracked.get(key) ?? new Set();

          members.add(callback);
          tracked.set(key, members);
        }

        add(type, callback, options);
      };

      target.removeEventListener = (type, callback, options) => {
        tracked.get(`${name}:${type}`)?.delete(callback);
        remove(type, callback, options);
      };
    }

    window.externalListeners = () =>
      Object.fromEntries([...tracked].map(([name, members]) => [name, members.size]));
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error);
  });
  await page.route("https://external-extensions.test/**", (route) =>
    route.request().url() === "https://external-extensions.test/"
      ? route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><head><style>${css}</style><style>body{padding:24px;font-family:sans-serif}.fixture-grid{display:grid;grid-template-columns:1fr 1.5fr;gap:32px}.fixture-grid>section{min-width:0;border:1px solid #bbb;padding:16px}[aria-label="Content canvas"]{min-height:200px;padding:20px;border:1px solid #888}nav{display:flex;gap:8px;flex-wrap:wrap}button{cursor:pointer}nav button,header button{padding:5px;border:1px solid #bbb}header{margin-block-end:20px}[data-notice]{padding:16px;border-inline-start:4px solid #246;background:#eef;margin-block:8px}[data-tone=warning]{background:#ffeeba}[data-reference-code]{border:2px solid #444;padding:12px}svg{max-width:24px;max-height:24px}.fixture-portal{position:fixed;inset:20px auto auto 35%;background:white;border:2px solid;padding:16px;z-index:100}[aria-label="Content JSON source"]{height:180px;width:100%}</style></head><body><div id="app"></div></body></html>`,
        })
      : route.fulfill({ body: "" }),
  );

  const mount = async () => {
    await page.addScriptTag({ path: bundle });
    await page.waitForFunction(() => window.externalFixture?.ready());
  };

  await page.goto("https://external-extensions.test/");
  await mount();
  const state = (kind) => page.evaluate((kind) => window.externalFixture.state(kind), kind);
  const source = (kind) => page.evaluate((kind) => window.externalFixture.source(kind), kind);

  const saved = (kind) =>
    page.waitForFunction((kind) => window.externalFixture.status(kind) === "saved", kind);

  const bodyKey = async (key = "Control+z") => {
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await page.keyboard.press(key);
  };

  const content = page.getByRole("textbox", { name: "Content canvas", exact: true });
  const form = page.getByRole("textbox", { name: "Form canvas", exact: true });

  const startContent = await state("content"),
    startForm = await state("form");

  await page.getByRole("button", { name: "Insert applicant", exact: true }).click();
  await page.getByRole("button", { name: "Insert applicant", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.externalFixture
        .state("form")
        .root.children.filter((node) => node.kind === "reference-code").length === 2,
  );
  const two = await state("form");
  assert.deepEqual(await state("content"), startContent, "form insertion leaves content untouched");
  await bodyKey();
  await page.waitForFunction(
    () =>
      window.externalFixture
        .state("form")
        .root.children.filter((node) => node.kind === "reference-code").length === 1,
  );
  await bodyKey("Control+y");
  assert.deepEqual(
    await state("form"),
    two,
    "body redo restores this form instance and identities",
  );

  await page.getByRole("button", { name: "Warning tone", exact: true }).click();
  await content.locator("[data-notice]").first().waitFor();
  assert.equal(await content.locator("[data-notice]").first().getAttribute("data-tone"), "warning");
  await bodyKey("Meta+z");
  assert.equal(
    await content.locator("[data-notice]").first().getAttribute("data-tone"),
    "information",
  );
  assert.deepEqual(await state("form"), two, "content toolbar ownership excludes form history");
  await bodyKey("Meta+Shift+z");
  const warning = await state("content");
  await page.getByRole("button", { name: "Open content portal", exact: true }).click();
  await page.getByRole("button", { name: "content portal focus", exact: true }).focus();
  await page.keyboard.press("Control+z");
  assert.equal(
    await content.locator("[data-notice]").first().getAttribute("data-tone"),
    "information",
  );
  await page.keyboard.press("Control+y");
  assert.deepEqual(
    await state("content"),
    warning,
    "portal history belongs to its React editor scope",
  );
  const native = page.getByRole("textbox", { name: "content native input", exact: true });
  await native.fill("Changed native text");
  await page.keyboard.press("Control+z");
  assert.deepEqual(
    await state("content"),
    warning,
    "native input undo does not reach editor history",
  );
  await page.getByRole("button", { name: "Close content portal", exact: true }).click();

  // The real formatting toolbar must mount and affect only the ordinary content editor.
  await page.evaluate(() => window.externalFixture.selectContent());
  await content.press("Shift");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.waitForFunction(() =>
    JSON.stringify(window.externalFixture.state("content")).includes('"format":1'),
  );
  assert.deepEqual(await state("form"), two);
  await saved("content");
  await saved("form");
  const beforeApply = await state("form");
  await page.getByRole("button", { name: /^Markdown(?:$| —)/ }).click();
  const textarea = page.getByRole("textbox", { name: "Markdown source", exact: true });
  const formSource = await textarea.inputValue();
  await textarea.fill(formSource.replace("Applicant name", "Applicant full name"));
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await page.waitForFunction(() =>
    window.externalFixture.source("form").includes("Applicant full name"),
  );
  const applied = await state("form");
  await bodyKey();
  assert.deepEqual(
    await state("form"),
    beforeApply,
    "source Apply is one undo step in its own form",
  );
  await bodyKey("Control+y");
  assert.deepEqual(await state("form"), applied);
  await page.getByRole("button", { name: "Content source", exact: true }).click();
  const contentSource = page.getByRole("textbox", { name: "Content JSON source", exact: true });
  const contentBeforeApply = await state("content");
  await contentSource.fill(
    (await contentSource.inputValue()).replace("Content notice", "Updated content notice"),
  );
  await page.getByRole("button", { name: "Apply content", exact: true }).click();
  await page.getByRole("button", { name: "Close content source", exact: true }).click();
  await bodyKey();
  assert.deepEqual(await state("content"), contentBeforeApply);
  await bodyKey("Control+y");

  // Changing the controlled prop while source already paused Lexical must remain a separate lock.
  for (const action of ["Apply changes", "Discard changes"]) {
    await page.getByRole("button", { name: /^Markdown(?:$| —)/ }).click();
    await textarea.fill(
      (await textarea.inputValue()).replace(
        /Applicant (full|legal) name/,
        action === "Apply changes" ? "Applicant legal name" : "Applicant revised name",
      ),
    );
    await page.getByRole("button", { name: "Close source", exact: true }).click();
    assert.equal(await page.evaluate(() => window.externalFixture.editable("form")), false);
    await page.getByRole("button", { name: "Lock form", exact: true }).click();
    await page.getByRole("button", { name: /^Markdown(?:$| —)/ }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.getByRole("button", { name: "Close source", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.externalFixture.editable("form")),
      false,
      `controlled readOnly survives ${action} while already paused`,
    );
    await page.getByRole("button", { name: "Unlock form", exact: true }).click();
    await page.waitForFunction(() => window.externalFixture.editable("form"));
  }

  // Open the actual form gutter menu and edit the extension's contributed inspector.
  const reference = form.locator("[data-reference-code]").first();
  await reference.hover();
  const grip = page.getByRole("button", { name: "Move this block by dragging", exact: true });
  await grip.waitFor();
  await grip.click();
  const prefix = page.getByRole("textbox", { name: "Reference prefix", exact: true });
  await prefix.waitFor();
  await prefix.fill("NEW");
  await page.waitForFunction(() =>
    window.externalFixture
      .state("form")
      .root.children.some(
        (node) => node.kind === "reference-code" && node.$?.settings?.code === "NEW",
      ),
  );

  const readonlyForm = await state("form"),
    readonlyContent = await state("content");

  await page.evaluate(() => window.externalFixture.readOnly("form", true));
  await saved("form");
  assert.equal(
    await page.evaluate(() => window.externalFixture.editable("form")),
    false,
    "pending autosave must not unlock an externally read-only editor",
  );

  if (await prefix.isVisible()) await prefix.fill("BAD");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Insert applicant", exact: true }).click();
  await bodyKey();
  assert.deepEqual(
    await state("form"),
    readonlyForm,
    "late read-only blocks stale inspector, insertion and history",
  );
  await page.evaluate(() => window.externalFixture.selectContent());
  await content.press("Shift");
  await page.getByRole("button", { name: "Bold", exact: true }).waitFor();
  await page.evaluate(() => window.externalFixture.readOnly("content", true));
  await page.getByRole("button", { name: "Bold", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Warning tone", exact: true }).click();
  await page.getByRole("button", { name: "Insert notice", exact: true }).click();
  await bodyKey();
  assert.deepEqual(await state("content"), readonlyContent);
  await page.evaluate(() => {
    window.externalFixture.readOnly("form", false);
    window.externalFixture.readOnly("content", false);
  });
  await saved("content");
  await saved("form");

  const formSaved = await source("form"),
    contentSaved = await source("content");

  assert.notEqual(formSaved, contentSaved);
  assert.equal(await page.evaluate(() => localStorage.getItem("external:form:saved")), formSaved);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("external:content:saved")),
    contentSaved,
  );
  await page.reload();
  await mount();
  assert.equal(await source("form"), formSaved);
  assert.equal(await source("content"), contentSaved);
  assert.equal(
    await content.locator("[data-notice]").first().textContent(),
    "Updated content notice",
  );

  // A removed instance must stop owning body shortcuts and draft listeners.
  await page.getByRole("button", { name: "Insert applicant", exact: true }).click();
  await page.getByRole("button", { name: "Unmount form", exact: true }).click();
  await page.waitForFunction(() => !window.externalFixture.mounted("form"));

  const detached = await state("form"),
    other = await state("content"),
    commits = await page.evaluate(() => window.externalFixture.commits());

  await bodyKey();
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: "external:form:saved" }));
    window.dispatchEvent(new Event("pagehide"));
  });
  assert.deepEqual(await state("form"), detached);
  assert.deepEqual(await state("content"), other);
  assert.deepEqual(await page.evaluate(() => window.externalFixture.commits()), commits);
  await page.getByRole("button", { name: "Unmount content", exact: true }).click();
  await page.waitForFunction(() => !window.externalFixture.mounted("content"));
  const listeners = await page.evaluate(() => window.externalListeners());
  assert.equal(listeners["window:storage"], 0);
  assert.equal(listeners["window:pagehide"], 0);
  assert.equal(listeners["document:visibilitychange"], 0);
  assert.equal(
    listeners["document:keydown"],
    0,
    "last editor releases the shared history listener",
  );
  assert.deepEqual(errors, []);
  assert.notDeepEqual(startForm, applied);
  console.log(
    "PASS public Notice/field/registry; two real stores; scoped body/portal/native-input history; formatting/gutter inspectors; atomic source Apply, independent reload, late read-only, unmount cleanup; no browser errors",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    console.error((await page.locator("body").innerText()).slice(-7000));
    await page.screenshot({ path: "/tmp/external-extensions-failure.png" });
  }

  throw error;
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
