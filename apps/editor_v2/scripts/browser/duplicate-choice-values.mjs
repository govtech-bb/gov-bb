import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

let page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

let root = page.locator('[contenteditable="true"][aria-label="Form"]');

const state = () =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const settings = (node) => node.$?.settings ?? {};

const values = (document) =>
  document.root.children
    .filter((node) => node.type === "option")
    .map((node) => node.$.native.option.value);

function questions(document) {
  const groups = new Map();
  const optionIds = new Set();

  for (const node of document.root.children.filter((node) => node.type === "option")) {
    const { question, option, owner } = node.$.native;
    assert.equal(owner, question.id, "every option belongs to its native question");
    assert.equal(settings(node).field, question.id, "projected identity matches native identity");
    assert.equal(settings(node).fieldId, question.key, "projected answer key matches native key");
    assert.equal(
      settings(node).optionValue,
      option.value,
      "projected answer values match native values",
    );
    assert.ok(!optionIds.has(option.id), "copies have independent option identities");
    optionIds.add(option.id);
    const group = groups.get(question.id) ?? { id: question.id, key: question.key, options: [] };
    assert.equal(group.key, question.key, "all options share their question's answer key");
    group.options.push({ id: option.id, value: option.value });
    groups.set(question.id, group);
  }

  return [...groups.values()];
}

const settle = () => page.waitForTimeout(180);

const source = `---
format: govbb-form
formatVersion: 2
title: Choice duplication
---

# Permission

::multiple-choice[Do you agree?]{#permission required fieldId="permission"}
- :option[Yes]{#yes optionValue="approved"}
- :option[No]{#no optionValue="declined"}
`;

try {
  await page.goto(process.argv[2] ?? "http://localhost:3013/");
  await root.waitFor();
  await page.getByRole("button", { name: /^Markdown/ }).click();
  await page.getByRole("textbox", { name: "Markdown source", exact: true }).fill(source);
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  assert.deepEqual(await page.getByRole("button", { name: /^Line \d+:/ }).allTextContents(), []);
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await root.waitFor();
  await settle();
  const title = root.locator("h2").filter({ hasText: "Do you agree?" });
  const before = await state();

  assert.deepEqual(values(before), ["approved", "declined"]);
  await title.hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menuitem", { name: /^Duplicate/ }).click();
  await settle();
  const after = await state();
  assert.deepEqual(values(after), ["approved", "declined", "approved", "declined"]);
  const originalQuestions = questions(before);
  const copiedQuestions = questions(after);
  assert.equal(originalQuestions.length, 1);
  assert.equal(copiedQuestions.length, 2);
  assert.deepEqual(copiedQuestions[0], originalQuestions[0], "the original stays unchanged");
  assert.notEqual(copiedQuestions[0].id, copiedQuestions[1].id, "the copy has its own native ID");
  assert.deepEqual(
    copiedQuestions.map((question) => question.key),
    ["permission", "permission-2"],
  );
  assert.deepEqual(
    copiedQuestions.map((question) => question.options.map((option) => option.value)),
    [
      ["approved", "declined"],
      ["approved", "declined"],
    ],
  );
  const ids = after.root.children.map((node) => node.$?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "all block identities remain unique");
  await title.last().click();
  await page.keyboard.press("Meta+z");
  await settle();
  assert.deepEqual(values(await state()), ["approved", "declined"]);
  assert.deepEqual(questions(await state()), originalQuestions);
  await page.keyboard.press("Meta+Shift+z");
  await settle();
  assert.deepEqual(values(await state()), values(after));
  assert.deepEqual(questions(await state()), copiedQuestions);
  await page.waitForFunction(
    () =>
      (
        localStorage.getItem("govbb-editor:draft:markdown:v2")?.match(/optionValue="approved"/g) ??
        []
      ).length === 2,
  );
  await page.reload();
  await root.waitFor();
  assert.deepEqual(values(await state()), ["approved", "declined", "approved", "declined"]);
  assert.deepEqual(questions(await state()), copiedQuestions);

  // Whole-question paste must preserve values and recognise the application clipboard marker.
  await title.first().click();
  await settle();
  await page.keyboard.press("Escape");
  await root.locator("[data-selected] > h2").waitFor();
  await page.keyboard.press("Meta+c");
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("govbb_blocks_clipboard") ?? "[]").length === 3,
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "govbb://blocks");
  await title.last().click();
  await settle();
  await page.keyboard.press("Escape");
  await root.locator("[data-selected] > h2").waitFor();
  await page.keyboard.press("Meta+v");
  await settle();
  assert.deepEqual(values(await state()), [
    "approved",
    "declined",
    "approved",
    "declined",
    "approved",
    "declined",
  ]);

  const pastedQuestions = questions(await state());
  assert.deepEqual(pastedQuestions.slice(0, 2), copiedQuestions);
  assert.deepEqual(
    pastedQuestions.map((question) => question.key),
    ["permission", "permission-2", "permission-3"],
  );
  assert.notEqual(pastedQuestions[2].id, copiedQuestions[0].id);
  assert.notEqual(pastedQuestions[2].id, copiedQuestions[1].id);

  // Copying one option into an existing question must not duplicate its submitted value.
  await root.locator("[data-option] [data-text]").first().click();
  await settle();
  await page.keyboard.press("Escape");
  await root.locator("[data-option][data-selected]").first().waitFor();
  await page.keyboard.press("Meta+c");
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("govbb_blocks_clipboard") ?? "[]").length === 1,
  );
  await root.locator("[data-option] [data-text]").last().click();
  await page.keyboard.press("Meta+v");
  await settle();
  assert.deepEqual(values(await state()), [
    "approved",
    "declined",
    "approved",
    "declined",
    "approved",
    "declined",
    "approved-2",
  ]);
  const optionPaste = questions(await state());
  assert.deepEqual(optionPaste.slice(0, 2), copiedQuestions);
  assert.equal(optionPaste.length, 3, "an option paste remains in the destination question");
  assert.equal(optionPaste[2].id, pastedQuestions[2].id);
  assert.equal(optionPaste[2].key, pastedQuestions[2].key);
  assert.deepEqual(optionPaste[2].options.slice(0, 2), pastedQuestions[2].options);
  assert.equal(new Set(optionPaste[2].options.map((option) => option.value)).size, 3);

  // This independent unlabelled fixture needs a fresh draft and its own migration backup.
  await page.close();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  root = page.locator('[contenteditable="true"][aria-label="Form"]');
  await page.goto(process.argv[2] ?? "http://localhost:3013/");
  await root.waitFor();

  // An unlabelled question needs its own copy boundary, rather than four options in one question.
  await page.getByRole("button", { name: /^Markdown/ }).click();
  await page
    .getByRole("textbox", { name: "Markdown source", exact: true })
    .fill(source.replace("[Do you agree?]", ""));
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  assert.deepEqual(await page.getByRole("button", { name: /^Line \d+:/ }).allTextContents(), []);
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await settle();
  assert.equal(await root.locator("h2").count(), 0);
  await root.locator("[data-option]").first().hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menuitem", { name: /^Duplicate/ }).click();
  await settle();
  const untitled = await state();
  assert.deepEqual(values(untitled), ["approved", "declined", "approved", "declined"]);
  const untitledQuestions = questions(untitled);
  assert.equal(untitledQuestions.length, 2);
  assert.notEqual(untitledQuestions[0].id, untitledQuestions[1].id);
  assert.deepEqual(
    untitledQuestions.map((question) => question.key),
    ["permission", "permission-2"],
  );
  assert.deepEqual(
    untitledQuestions.map((question) => question.options.map((option) => option.value)),
    [
      ["approved", "declined"],
      ["approved", "declined"],
    ],
  );
  assert.equal(await root.locator("h2").count(), 1);
  await root.locator("h2").click();
  await page.keyboard.press("Meta+z");
  await settle();
  assert.equal(await root.locator("h2").count(), 0);
  assert.deepEqual(values(await state()), ["approved", "declined"]);
  await page.keyboard.press("Meta+Shift+z");
  await settle();
  assert.deepEqual(values(await state()), values(untitled));
  assert.deepEqual(questions(await state()), untitledQuestions);
  await page.waitForFunction(
    () =>
      (
        localStorage.getItem("govbb-editor:draft:markdown:v2")?.match(/optionValue="approved"/g) ??
        []
      ).length === 2,
  );
  await page.reload();
  await root.waitFor();
  assert.deepEqual(values(await state()), values(untitled));
  assert.deepEqual(questions(await state()), untitledQuestions);
  assert.deepEqual(errors, []);
  console.log(
    "PASS labelled and unlabelled Duplicate preserve custom answer values and independent identities, undo/redo, Markdown reload, whole-question paste and collision-safe option paste; no browser errors",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/lexical-duplicate-choice-values-failure.png",
    fullPage: true,
  });
  console.error(
    await page.evaluate(() => ({
      selected: [...document.querySelectorAll("[data-selected]")].map((node) => node.textContent),
      clipboard: localStorage.getItem("govbb_blocks_clipboard"),
      focus: document.activeElement?.outerHTML.slice(0, 120),
    })),
  );
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
