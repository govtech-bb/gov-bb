import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const root = page.locator('[contenteditable="true"][aria-label="Form"]');

const state = () =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const rules = (nodes) => nodes.filter((node) => node.widget === "conditional-logic");

const settings = (node) => node.$?.settings ?? {};

const settle = () => page.waitForTimeout(180);

const addRule = async (question, action) => {
  await question.hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  assert.equal(await page.getByRole("menuitem", { name: /Change label with answers/ }).count(), 0);
  assert.equal(await page.getByRole("menuitem", { name: /Change title with answers/ }).count(), 0);
  await page.getByRole("menuitem", { name: /^Add conditional logic/ }).click();

  const rule = page
    .locator("[data-logic-block]")
    .filter({ has: page.locator('[data-logic-action=""]') })
    .last();

  await rule.getByRole("combobox", { name: "Select action", exact: true }).click();
  await page.getByRole("option", { name: action, exact: true }).click();
};

try {
  // This suite retains the legacy authoring repair path; native controls are covered by native-form-schema.
  const legacySource = await readFile(
    new URL("../../tests/fixtures/forms/demo.canonical.md", import.meta.url),
    "utf8",
  );

  await page.addInitScript((source) => {
    if (!localStorage.getItem("legacy-logic-proof")) {
      localStorage.clear();
      localStorage.setItem("govbb-editor:draft:markdown:v2", source);
      localStorage.setItem("legacy-logic-proof", "1");
    }
  }, legacySource);
  await page.goto(process.argv[2] ?? "http://localhost:3013/");
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await settle();
  const initial = await state();
  assert.equal(settings(initial.root.children[0]).logicVersion, 2);
  assert.ok(
    rules(initial.root.children).some((node) =>
      settings(node).actions?.some((action) => action.type === "SHOW_BLOCKS"),
    ),
    "demo follow-up migrated into a visible rule",
  );
  assert.equal(await page.locator("[data-wording-editor]").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: /Change (?:title|label) with answers/ }).count(),
    0,
    "wording has no dedicated creation buttons",
  );

  const pageTitle = root.locator("[data-page-title]").nth(1);

  const parish = root
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: "Which parish is the event in?" }) })
    .first();

  await addRule(parish, "Change page heading");

  const titleRule = page
    .locator("[data-logic-block]")
    .filter({ has: page.getByLabel("Replacement page heading", { exact: true }) });

  await titleRule
    .getByRole("combobox", { name: "Page whose heading changes", exact: true })
    .click();
  await page.getByRole("option", { name: "Page 2 · Road closure", exact: true }).click();
  await titleRule.getByRole("combobox", { name: "Select field", exact: true }).click();
  await page.getByRole("option", { name: "Which parish is the event in?", exact: true }).click();
  await titleRule.getByRole("combobox", { name: "Select option", exact: true }).click();
  await page.getByRole("option", { name: "Christ Church", exact: true }).click();
  await titleRule.getByLabel("Replacement page heading").fill("Road closures in Christ Church");
  assert.match(await titleRule.innerText(), /Change page heading/);
  assert.equal(await pageTitle.locator(":scope > [data-text]").textContent(), "Road closure");
  const beforeBadge = rules((await state()).root.children).length;
  await pageTitle.getByRole("button", { name: /Edit logic .* for Road closure/ }).click();
  assert.equal(await titleRule.count(), 1, "badge returns to the existing rule");
  assert.equal(
    rules((await state()).root.children).length,
    beforeBadge,
    "the page badge only navigates to its rule",
  );
  console.log("PASS page wording is authored inside Conditional logic; its badge only navigates");

  const yes = root.locator("[data-option] [data-text]").filter({ hasText: /^Yes$/ }).first();
  await yes.click();
  await page.keyboard.press("Alt+Enter");
  await page.getByRole("dialog", { name: "Insert a block" }).waitFor();
  const beforeCancel = await state();
  await page.keyboard.press("Escape");
  await settle();
  assert.deepEqual(
    await state(),
    beforeCancel,
    "cancelling the follow-up picker creates no blank block or rule",
  );
  await yes.click();
  await page.keyboard.press("Alt+Enter");
  await page.getByRole("dialog", { name: "Insert a block" }).waitFor();
  await page.getByRole("combobox", { name: "Search blocks" }).fill("short answer");
  const beforeInsert = await state();
  await page.getByRole("option", { name: "Text input", exact: true }).first().click();
  await settle();
  const inserted = await state();
  const oldIds = new Set(beforeInsert.root.children.map((node) => node.$?.id));
  const added = inserted.root.children.filter((node) => !oldIds.has(node.$?.id));
  assert.equal(added.filter((node) => node.type === "question").length, 1);
  assert.ok(
    added
      .filter((node) => ["question", "input"].includes(node.type))
      .every((node) => settings(node).hidden),
    "new follow-up is initially Hidden",
  );
  const newInput = added.find((node) => node.type === "input");

  const owner = rules(inserted.root.children).filter((node) =>
    settings(node).actions?.some((action) => action.showBlocks?.includes(settings(newInput).field)),
  );

  assert.equal(owner.length, 1, "follow-up has one explicit Show owner");
  assert.equal(
    rules(inserted.root.children).length,
    rules(beforeInsert.root.children).length,
    "same answer reuses its existing Show rule",
  );
  assert.equal(
    await page.evaluate(() => !!document.activeElement?.closest("[data-logic-block]")),
    true,
    "insertion focus lands in its rule",
  );
  await root.locator("[data-page-title] > [data-text]").first().click();
  await page.keyboard.press("Control+z");
  await settle();
  assert.deepEqual(
    await state(),
    beforeInsert,
    "one undo removes insertion and its rule edit together",
  );
  await page.keyboard.press("Control+y");
  await settle();
  assert.deepEqual(await state(), inserted);

  const titleIndex = inserted.root.children.findIndex(
    (node) => node.type === "question" && !oldIds.has(node.$?.id),
  );

  await root.locator(":scope > *").nth(titleIndex).locator("h2").fill("Extra road details");
  await settle();
  console.log(
    "PASS keyboard follow-up, cancellation, Hidden target, single owner, focus, atomic undo and redo",
  );

  const question = root
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: "Which roads?" }) })
    .first();

  await addRule(question, "Change question label");

  const labelRule = page
    .locator("[data-logic-block]")
    .filter({ has: page.getByLabel("Replacement question label", { exact: true }) });

  await labelRule
    .getByRole("combobox", { name: "Question whose label changes", exact: true })
    .click();
  await page.getByRole("option", { name: "Which roads?", exact: true }).click();
  await labelRule.getByRole("combobox", { name: "Select field", exact: true }).click();
  await page.getByRole("option", { name: "Do you need to close a road?", exact: true }).click();
  await labelRule.getByRole("combobox", { name: "Select option", exact: true }).click();
  await page.getByRole("option", { name: "Yes", exact: true }).click();
  await labelRule.getByLabel("Replacement question label").fill("List the roads you will close");
  await labelRule
    .locator("[data-logic-action]")
    .getByRole("button", { name: "Add, remove, and more..." })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Add action", exact: true }).click();
  const addedAction = labelRule.locator("[data-logic-action]").last();
  await addedAction.getByRole("combobox", { name: "Select action" }).click();
  await page.getByRole("option", { name: "Require answer", exact: true }).click();
  await addedAction.getByRole("combobox", { name: "Select an input field" }).click();
  await page.getByRole("option", { name: "Which roads?", exact: true }).click();
  assert.match(await addedAction.innerText(), /Require answer/);
  assert.match(await question.innerText(), /Wording.*Required|Required.*Wording/);
  console.log(
    "PASS wording and additional actions share a rule, with keyboard-accessible action menus",
  );

  await page.waitForFunction(() =>
    localStorage
      .getItem("govbb-editor:draft:markdown:v2")
      ?.includes("List the roads you will close"),
  );
  const saved = await state();
  assert.ok(
    saved.root.children.every(
      (node) =>
        settings(node).conditionalLabel === undefined &&
        settings(node).conditionalTitle === undefined,
    ),
  );
  await page.reload();
  await root.waitFor();
  assert.equal(
    await page.getByLabel("Replacement page heading").inputValue(),
    "Road closures in Christ Church",
  );
  assert.equal(
    await page.getByLabel("Replacement question label").inputValue(),
    "List the roads you will close",
  );
  assert.equal(
    await page.getByRole("button", { name: /Change (?:title|label) with answers/ }).count(),
    0,
  );
  assert.equal(await page.locator("[data-wording-editor]").count(), 0);
  assert.equal(await root.locator("h2").filter({ hasText: "Extra road details" }).count(), 1);
  const beforeDuplicate = await state();
  const originalIds = new Set(beforeDuplicate.root.children.map((node) => node.$?.id));
  await root
    .locator("h2")
    .filter({ hasText: /^Do you need to close a road\?/ })
    .first()
    .click();
  await page.keyboard.press("Meta+d");
  await settle();
  const duplicated = await state();
  const copiedNodes = duplicated.root.children.filter((node) => !originalIds.has(node.$?.id));
  const copiedRules = rules(copiedNodes);
  assert.equal(copiedRules.length, 1, "Duplicate includes the question's own Show rule");
  const copiedIds = new Set(copiedNodes.flatMap((node) => [node.$?.id, settings(node).field]));
  assert.ok(
    settings(copiedRules[0]).conditionals.every(
      (condition) => copiedIds.has(condition.field) && copiedIds.has(condition.value),
    ),
  );
  assert.ok(
    settings(copiedRules[0]).actions.every(
      (action) =>
        action.type === "SHOW_BLOCKS" && action.showBlocks.every((target) => copiedIds.has(target)),
    ),
  );
  await root.locator("[data-page-title] > [data-text]").first().click();
  await page.keyboard.press("Control+z");
  await settle();
  assert.deepEqual(
    await state(),
    beforeDuplicate,
    "question and associated rule duplicate in one undo step",
  );
  await page.keyboard.press("Control+y");
  await settle();
  assert.deepEqual(await state(), duplicated);
  console.log("PASS duplicate keeps follow-up rules independent, with atomic undo and redo");

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await settle();
    await page.getByLabel("Replacement question label").scrollIntoViewIfNeeded();
    await settle();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `page stays within ${width}px`,
    );
    await page.screenshot({ path: `/tmp/lexical-unified-logic-mobile-${width}.png` });
  }

  assert.deepEqual(errors, []);
  console.log("PASS canonical reload, one owner, mobile containment, no browser errors");
} catch (error) {
  console.error(errors);
  await page.screenshot({ path: "/tmp/lexical-unified-logic-failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
