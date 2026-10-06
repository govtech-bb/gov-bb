import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const form = () => page.locator('[contenteditable="true"][aria-label="Form"]');

const state = () =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const settle = () => page.waitForTimeout(180);

const groups = [
  {
    id: "permits",
    label: "Permits",
    options: [{ id: "music", label: "Music", optionValue: "music" }],
  },
];

const source = `---
format: govbb-form
formatVersion: 2
title: Widget recovery
---

# Supporting information

::file-upload{#evidence hidden}

::checkbox-accordion{#choices hidden}

:::source-state
\`\`\`json
${JSON.stringify({ questions: { choices: { settings: { groups } } } })}
\`\`\`
:::
`;

try {
  // Open the legacy draft directly so its recovery controls are tested before native conversion.
  await context.addInitScript((source) => {
    if (!localStorage.getItem("govbb-editor:draft:markdown:v2"))
      localStorage.setItem("govbb-editor:draft:markdown:v2", source);
  }, source);
  await page.goto(process.argv[2] ?? "http://localhost:3013/");
  await form().waitFor();
  await settle();
  assert.equal(await form().locator("h2").count(), 0, "both widgets are untitled");

  for (const [kind, key] of [
    ["file-upload", "Enter"],
    ["checkbox-accordion", "Space"],
  ]) {
    const before = await state();
    const index = before.root.children.findIndex((node) => node.widget === kind);
    assert.ok(index >= 0);
    const block = form().locator(":scope > *").nth(index);

    const recovery = () =>
      block.getByRole("button", { name: "Make visible: Unlabelled question", exact: true });

    await recovery().waitFor();
    assert.match(await block.innerText(), /Hidden without a Show rule/);
    await recovery().focus();
    assert.equal(await recovery().evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press(key);
    await settle();
    const after = await state();
    assert.equal(
      await form().evaluate((element) => element === document.activeElement),
      true,
      "focus returns to the editor after recovery disappears",
    );
    assert.equal(after.root.children[index].$?.settings?.hidden, undefined);
    assert.deepEqual(
      after.root.children.filter((_, i) => i !== index),
      before.root.children.filter((_, i) => i !== index),
    );
    assert.equal(await recovery().count(), 0);
    await page.keyboard.press("Meta+z");
    await recovery().waitFor();
    assert.deepEqual(await state(), before, "one undo restores exactly the prior state");
    console.log(`PASS untitled ${kind}: ${key} activation, scoped recovery and undo`);
  }

  await page.screenshot({
    path: "/tmp/lexical-untitled-widget-recovery-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await form().locator("[data-hidden-recovery]").count(), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({
    path: "/tmp/lexical-untitled-widget-recovery-mobile.png",
    fullPage: true,
  });
  await page.waitForTimeout(700);
  await page.reload();
  await form().waitFor();
  await form().locator("[data-hidden-recovery]").last().waitFor();
  assert.equal(await form().locator("[data-hidden-recovery]").count(), 2);
  assert.deepEqual(errors, []);
  console.log("PASS untitled widget recovery: 320px layout, reload and no browser errors");
} catch (error) {
  await page.screenshot({
    path: "/tmp/lexical-untitled-widget-recovery-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
