import { authenticatedContext, authenticatedPage } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";
import {
  formFixtureUrl,
  seedFormSource,
  openDemoForm,
  reloadEditorFromSource,
} from "./form-fixture.mjs";

const browser = await chromium.launch();

const page = await authenticatedPage(browser, { viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const root = page.locator('[contenteditable="true"][aria-label="Form"]');

const state = () =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const settings = (node) => node.$?.settings ?? {};

const confirmation = (document) =>
  document.root.children.find((node) => settings(node).confirmation === true);

const settle = () => page.waitForTimeout(180);

const warning =
  "Keep only text, headings and lists on the confirmation page. Move other blocks to an earlier page.";

try {
  await openDemoForm(page, process.argv[2] ?? "http://localhost:3013/");
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const initial = await state();
  assert.equal(
    await page
      .getByText("If you need help with your application, contact:", { exact: true })
      .count(),
    0,
    "confirmation pages do not append a generated contact footer",
  );
  assert.deepEqual(initial.root.children[0].$?.native?.form?.settings.contact, {
    title: "Permits Office",
    telephoneNumber: "+1 (246) 555-0100",
    email: "permits@example.gov.bb",
  });
  const pageId = confirmation(initial).$?.id;
  await page.waitForFunction(() => window.editorFixture.source().includes('type="confirmation"'));
  const toggle = page.getByRole("switch", { name: "Confirmation page", exact: true });
  assert.equal(await toggle.getAttribute("aria-checked"), "true");

  await root.locator(":scope > *").last().hover();
  await page.getByRole("button", { name: "Insert block below", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Insert a block" });
  await dialog.waitFor();

  for (const name of [
    "Text input",
    "Radios",
    "Conditional logic",
    "Calculated fields",
    "National ID number",
  ])
    assert.equal(
      await dialog.getByRole("option", { name, exact: true }).count(),
      0,
      `${name} is not offered on confirmation pages`,
    );

  for (const name of ["Text", "Heading 2", "Bulleted list"])
    assert.equal(await dialog.getByRole("option", { name, exact: true }).count(), 1);
  await page.keyboard.press("Escape");
  await settle();
  const line = root.locator(":scope > *").last();
  await line.click();
  await page.keyboard.type("/");
  const slash = page.locator("#typeahead-menu");
  await slash.getByRole("option").first().waitFor();
  assert.equal(await slash.getByRole("option", { name: "Text input", exact: true }).count(), 0);
  assert.equal(
    await slash.getByRole("option", { name: "Conditional logic", exact: true }).count(),
    0,
  );
  assert.equal(await slash.getByRole("option", { name: "Text", exact: true }).count(), 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");

  // Keyboard shortcuts can introduce unsupported content; this must never change the page purpose.
  await page.keyboard.type("[]");
  await settle();
  assert.equal(confirmation(await state())?.$?.id, pageId);
  assert.ok(
    (await state()).root.children.at(-1)?.type === "option",
    "the shortcut created a checkbox",
  );
  await page.getByText(warning, { exact: true }).waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await page.waitForTimeout(700);
  await reloadEditorFromSource(page);
  await root.waitFor();
  assert.equal(
    confirmation(await state())?.$?.id,
    pageId,
    "invalid content does not lose the stored confirmation type on reload",
  );
  await page.getByText(warning, { exact: true }).waitFor();

  // A deliberate page-type edit is the only conversion, and remains undoable.
  await toggle.click();
  await settle();
  assert.equal(confirmation(await state()), undefined);
  assert.equal(await page.getByText(warning, { exact: true }).count(), 0);
  await root.locator("[data-page-title] > [data-text]").last().click();
  await page.keyboard.press("Meta+z");
  await settle();
  assert.equal(confirmation(await state())?.$?.id, pageId);
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "/tmp/lexical-confirmation-page.png" });

  const recoveryContext = await authenticatedContext(browser);
  const recoveryPage = await recoveryContext.newPage();

  const original = (await page.evaluate(() => window.editorFixture.source())).replace(
    'type="confirmation"',
    'type="unsupported-page"',
  );

  assert.match(original, /unsupported-page/);
  recoveryPage.on("pageerror", (error) => errors.push(error.message));
  await seedFormSource(recoveryPage, original);
  await recoveryPage.goto(formFixtureUrl(process.argv[2] ?? "http://localhost:3000/"));
  await recoveryPage.getByRole("dialog", { name: "Form source", exact: true }).waitFor();
  assert.equal(
    await recoveryPage.locator('[contenteditable="true"][aria-label="Form"]').count(),
    0,
  );
  assert.equal(
    await recoveryPage.getByRole("textbox", { name: "Markdown source", exact: true }).inputValue(),
    original,
  );
  const downloadPromise = recoveryPage.waitForEvent("download");
  await recoveryPage.getByRole("button", { name: "Download original input", exact: true }).click();
  assert.equal(await readFile(await (await downloadPromise).path(), "utf8"), original);
  await recoveryPage.reload();
  await recoveryPage.getByRole("dialog", { name: "Form source", exact: true }).waitFor();
  await recoveryContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS confirmation naming, unsupported page recovery and exact original download, both insertion menus, retained purpose after unsupported input/reload, explicit conversion, undo and mobile; no browser errors",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/lexical-confirmation-page-failure.png", fullPage: true });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
