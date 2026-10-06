import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const url = process.argv[2] ?? "http://localhost:3013/";

const storageKey = "govbb-editor:draft:markdown:v2";

const errors = [];

let current;

const settings = (node) => node.$?.settings ?? {};

const text = (node) => node.text ?? node.children?.map(text).join("") ?? "";

const form = (page) => page.locator('[contenteditable="true"][aria-label="Form"]');

const state = (page) =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const settle = (page) => page.waitForTimeout(180);

const question = (page, label) =>
  form(page)
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: label }) })
    .first();

const group = (document, label) => {
  const nodes = document.root.children;
  const index = nodes.findIndex((node) => node.type === "question" && text(node) === label);
  assert.ok(index >= 0, `question exists: ${label}`);

  const next = nodes.findIndex(
    (node, at) => at > index && (node.type === "question" || node.widget === "page-break"),
  );

  return nodes.slice(index, next < 0 ? undefined : next);
};

const fresh = async ({ legacy = false } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  if (legacy) {
    const source = await readFile(
      new URL("../../tests/fixtures/forms/demo.canonical.md", import.meta.url),
      "utf8",
    );

    await page.addInitScript(
      ({ source, storageKey }) => {
        if (localStorage.getItem("product-legacy-fixture")) return;
        localStorage.setItem(storageKey, source);
        localStorage.setItem("product-legacy-fixture", "1");
      },
      { source, storageKey },
    );
  }

  current = page;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await form(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await settle(page);

  return page;
};

const openMenu = async (page, label) => {
  await question(page, label).hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menu").first().waitFor();
};

const openInsert = async (page, block) => {
  await block.hover();
  await page.getByRole("button", { name: "Insert block below", exact: true }).click();
  await page.getByRole("dialog", { name: "Insert a block" }).waitFor();
};

const addLegacyRule = async (page, label, action) => {
  await openMenu(page, label);
  await page.getByRole("menuitem", { name: /^Add conditional logic/ }).click();

  const blank = page
    .locator("[data-logic-block]")
    .filter({ has: page.locator('[data-logic-action=""]') })
    .last();

  await blank.getByRole("combobox", { name: "Select action", exact: true }).click();
  await page.getByRole("option", { name: action, exact: true }).click();
};

const openJson = async (page) => {
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await page.getByRole("heading", { name: "Form JSON", exact: true }).waitFor();
};

const closeJson = (page) =>
  page.getByRole("button", { name: "Close form JSON", exact: true }).click();

const exported = async (page) => {
  await openJson(page);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const download = await event;
  const document = JSON.parse(await readFile(await download.path(), "utf8"));
  await closeJson(page);

  return document;
};

const importForm = async (page, document) => {
  await openJson(page);
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "product-simplifications.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await page
    .getByText("Form imported. Undo returns to your previous form.", { exact: true })
    .waitFor();
  await closeJson(page);
  await form(page).waitFor();
};

const addNativeRule = async (page, label, action) => {
  const oldIds = new Set(
    (await state(page)).root.children.map((node) => node.$?.native?.logic?.id),
  );

  await openMenu(page, label);
  await page.getByRole("menuitem", { name: /^Add conditional logic/ }).click();
  const nodes = (await state(page)).root.children;

  const index = nodes.findIndex(
    (node) => node.$?.native?.logic && !oldIds.has(node.$.native.logic.id),
  );

  assert.ok(index >= 0, "adding conditional logic creates a native rule");
  const rule = form(page).locator(":scope > *").nth(index).locator("[data-native-logic]");
  await rule.getByRole("button", { name: "Add action", exact: true }).click();
  await rule.getByRole("combobox", { name: "Action", exact: true }).selectOption(action);

  return rule;
};

try {
  // Import native rich hints through the same JSON boundary used by authors.
  {
    const page = await fresh();
    const fixture = await exported(page);

    const event = fixture.blocks.find(
      (block) => block.type === "question" && block.label === "Event name",
    );

    assert.ok(event, "the native demo contains Event name");
    event.hint = [
      {
        id: "event-hint-guidance",
        type: "content",
        kind: "paragraph",
        content: [
          "Use ",
          { text: "bold guidance", marks: ["bold"] },
          " and ",
          { link: "https://example.com/help", content: "the guide" },
          ".",
        ],
      },
      {
        id: "event-hint-more",
        type: "content",
        kind: "paragraph",
        content: ["Keep ", { text: "this second line", marks: ["italic"] }, "."],
      },
    ];
    await importForm(page, fixture);
    await openMenu(page, "Event name");
    await page.getByRole("menuitem", { name: /^Advanced/ }).focus();
    await page.keyboard.press("ArrowRight");
    await page
      .getByRole("textbox", { name: "Internal alias", exact: true })
      .fill("Legacy event alias");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const hint = form(page).locator("[data-hint]").filter({ hasText: "bold guidance" });
    assert.equal(await hint.locator("strong, b").textContent(), "bold guidance");
    assert.equal(
      await hint.getByRole("link", { name: "the guide" }).getAttribute("href"),
      "https://example.com/help",
    );

    const beforeEdit = group(await state(page), "Event name").filter(
      (node) => node.type === "paragraph",
    );

    assert.equal(beforeEdit.length, 2);
    await openMenu(page, "Event name");
    const menu = page.getByRole("menu").first();
    assert.match(await menu.innerText(), /Event name/);
    assert.doesNotMatch(await menu.innerText(), /Legacy event alias/);
    assert.equal(
      await menu.getByRole("textbox", { name: /Hint/i }).count(),
      0,
      "there is no competing plain-text hint editor",
    );
    await page.getByRole("menuitem", { name: "Edit hint text", exact: true }).click();
    await settle(page);
    assert.deepEqual(
      group(await state(page), "Event name").filter((node) => node.type === "paragraph"),
      beforeEdit,
      "Edit hint text preserves every rich paragraph",
    );
    assert.equal(
      await page.evaluate(
        () => !!window.getSelection()?.anchorNode?.parentElement?.closest("[data-hint]"),
      ),
      true,
      "Edit hint text focuses the actual canvas hint",
    );
    await page.keyboard.press("End");
    await page.keyboard.type(" Updated.");
    await settle(page);
    assert.equal(await hint.locator("strong, b").textContent(), "bold guidance");
    assert.equal(
      await hint.getByRole("link", { name: "the guide" }).getAttribute("href"),
      "https://example.com/help",
    );
    assert.equal(
      await form(page)
        .locator("[data-hint]")
        .filter({ hasText: "Keep this second line." })
        .locator("em, i")
        .textContent(),
      "this second line",
    );

    await openMenu(page, "Event name");
    await page.getByRole("menuitem", { name: /^Advanced/ }).focus();
    await page.keyboard.press("ArrowRight");
    const alias = page.getByRole("textbox", { name: "Internal alias", exact: true });
    await alias.waitFor();
    assert.equal(await alias.inputValue(), "Legacy event alias");
    await alias.fill("Updated internal alias");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    assert.match(await question(page, "Event name").innerText(), /^Event name/);
    const rule = await addNativeRule(page, "Event name", "setRequired");
    const targets = rule.getByRole("combobox", { name: "Target", exact: true });
    assert.equal(await targets.getByRole("option", { name: "Event name", exact: true }).count(), 1);
    assert.equal(
      await targets
        .getByRole("option", { name: /Updated internal alias|Legacy event alias/ })
        .count(),
      0,
    );
    await targets.selectOption(event.id);
    const edited = await state(page);
    assert.ok(
      edited.root.children.some((node) =>
        node.$?.native?.logic?.rules.some((rule) =>
          rule.actions.some(
            (action) => action.type === "setRequired" && action.target === event.id,
          ),
        ),
      ),
    );
    assert.deepEqual(
      group(edited, "Event name").filter((node) => node.type === "paragraph")[1],
      beforeEdit[1],
      "untouched rich hint retains its native identity and formatting",
    );
    // Internal aliases remain recoverable draft metadata; native export currently has no mapping for them.
    await openJson(page);
    const blockedDownloads = [];
    const recordDownload = (download) => blockedDownloads.push(download);
    page.on("download", recordDownload);
    await page.getByRole("button", { name: "Download JSON", exact: true }).click();
    await page
      .getByRole("list", { name: "JSON diagnostics" })
      .getByText(/This block's name setting has no native form representation/)
      .waitFor();
    assert.equal(
      blockedDownloads.length,
      0,
      "unsupported alias metadata blocks native export without dropping the draft",
    );
    page.off("download", recordDownload);
    await closeJson(page);
    await page.waitForFunction(
      (key) =>
        localStorage.getItem(key)?.includes("Updated internal alias") &&
        localStorage.getItem(key)?.includes("Updated."),
      storageKey,
    );
    await page.reload();
    await form(page).waitFor();
    assert.equal(
      await form(page)
        .locator("[data-hint]")
        .filter({ hasText: "bold guidance" })
        .getByRole("link", { name: "the guide" })
        .count(),
      1,
    );
    assert.ok(
      group(await state(page), "Event name").some(
        (node) => settings(node).name === "Updated internal alias",
      ),
    );
    console.log(
      "PASS rich hints edit in place; internal aliases stay advanced and canvas labels identify fields",
    );
    await page.context().close();
  }

  {
    const page = await fresh();
    await openInsert(
      page,
      form(page)
        .locator(":scope > *")
        .filter({ hasText: /^Use this form to apply/ })
        .first(),
    );
    const dialog = page.getByRole("dialog", { name: "Insert a block" });
    assert.equal(await dialog.getByText("Questions", { exact: true }).count(), 1);
    assert.equal(await dialog.getByText("Input blocks", { exact: true }).count(), 0);
    assert.equal(await dialog.getByText("Answer inputs", { exact: true }).count(), 0);
    assert.equal(await dialog.getByRole("option", { name: "Text input", exact: true }).count(), 1);
    const search = page.getByRole("combobox", { name: "Search blocks" });
    await search.fill("show/hide");
    assert.equal(await dialog.getByRole("option", { name: "Details", exact: true }).count(), 1);
    assert.equal(await dialog.getByRole("option", { name: "Show/hide", exact: true }).count(), 0);
    await search.fill("short answer");
    assert.equal(await dialog.getByRole("option", { name: "Text input", exact: true }).count(), 1);
    await search.fill("title");
    assert.equal(
      await dialog.getByRole("option", { name: "Title (Mr, Ms, Dr)", exact: true }).count(),
      1,
    );
    assert.equal(
      await dialog.getByRole("option", { name: "Question label", exact: true }).count(),
      1,
    );
    assert.equal(await dialog.getByRole("option", { name: "Title", exact: true }).count(), 0);
    const oldIds = new Set((await state(page)).root.children.map((node) => node.$?.id));
    await dialog
      .getByText("Layout blocks", { exact: true })
      .locator("..")
      .getByRole("option", { name: "Question label", exact: true })
      .click();
    await settle(page);

    const titleIndex = (await state(page)).root.children.findIndex(
      (node) => node.type === "question" && !oldIds.has(node.$?.id),
    );

    assert.ok(titleIndex >= 0);
    const untitled = form(page).locator(":scope > *").nth(titleIndex).locator("h2");
    await untitled.fill("Context answer");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    const slash = page.locator("#typeahead-menu");
    await slash.getByRole("option").first().waitFor();
    assert.equal(await slash.getByText("Answer inputs", { exact: true }).count(), 1);
    assert.equal(await slash.getByText("Questions", { exact: true }).count(), 0);
    assert.equal(await slash.getByText("Input blocks", { exact: true }).count(), 0);
    await page.keyboard.type("short answer");
    assert.equal(await slash.getByRole("option", { name: "Text input", exact: true }).count(), 1);
    const beforeInput = await state(page);
    await page.keyboard.press("Enter");
    await settle(page);
    const afterInput = await state(page);
    assert.equal(
      afterInput.root.children.filter((node) => node.type === "question").length,
      beforeInput.root.children.filter((node) => node.type === "question").length,
      "a contextual answer does not add another title",
    );
    assert.equal(
      group(afterInput, "Context answer").filter((node) => node.type === "input").length,
      1,
    );
    await openInsert(page, question(page, "Context answer"));
    assert.equal(
      await dialog.getByText("Questions", { exact: true }).count(),
      1,
      "a completed question returns to normal insertion",
    );
    assert.equal(await dialog.getByText("Answer inputs", { exact: true }).count(), 0);
    await search.fill("expandable help");
    await dialog.getByRole("option", { name: "Details", exact: true }).click();
    await settle(page);
    assert.equal(
      (await state(page)).root.children.filter((node) => node.type === "show-hide").length,
      2,
      "renaming the picker keeps the disclosure node type",
    );
    console.log("PASS one question catalog, contextual bare answers, and searchable Details");
    await page.context().close();
  }

  {
    // Retain the existing Show-target repair contract for imported legacy drafts.
    const page = await fresh({ legacy: true });
    await addLegacyRule(page, "Do you need to close a road?", "Show blocks");

    const rule = page
      .locator("[data-logic-block]")
      .filter({ has: page.getByRole("button", { name: "Select blocks", exact: true }) });

    await rule.getByRole("combobox", { name: "Select field", exact: true }).click();
    await page.getByRole("option", { name: "Do you need to close a road?", exact: true }).click();
    await rule.getByRole("combobox", { name: "Select option", exact: true }).click();
    await page.getByRole("option", { name: "Yes", exact: true }).click();
    const before = await state(page);

    const targetBefore = group(before, "Which roads?").filter((node) =>
      ["question", "input", "long-answer"].includes(node.type),
    );

    assert.ok(targetBefore.length >= 2);
    assert.ok(
      targetBefore.every((node) => !settings(node).hidden),
      "target starts visible",
    );
    await rule.getByRole("button", { name: "Select blocks", exact: true }).click();
    await page.getByPlaceholder("Search", { exact: true }).fill("Which roads?");
    await page.getByRole("treeitem", { name: "Which roads?", exact: true }).click();
    await page.keyboard.press("Escape");
    await settle(page);
    const after = await state(page);

    const targetAfter = group(after, "Which roads?").filter((node) =>
      targetBefore.some((old) => old.$?.id === node.$?.id),
    );

    assert.ok(
      targetAfter.every((node) => settings(node).hidden),
      "choosing Show targets also hides their label and answer initially",
    );

    const ruleNode = after.root.children.find(
      (node) =>
        node.widget === "conditional-logic" &&
        settings(node).actions?.some((action) =>
          action.showBlocks?.includes(
            settings(targetAfter.find((item) => item.type !== "question")).field,
          ),
        ),
    );

    assert.ok(ruleNode, "one explicit Show action owns the selected answer");
    const ruleIndex = after.root.children.findIndex((node) => node.$?.id === ruleNode.$?.id);

    const selectedRule = form(page)
      .locator(":scope > *")
      .nth(ruleIndex)
      .locator("[data-logic-block]");

    assert.match(
      await selectedRule.innerText(),
      /New Show targets start hidden and appear when this rule matches/,
    );
    await form(page).locator("[data-page-title] > [data-text]").first().click();
    await page.keyboard.press("Meta+z");
    await settle(page);
    assert.deepEqual(
      await state(page),
      before,
      "one undo reverts the target selection and initial visibility together",
    );
    await page.keyboard.press("Meta+Shift+z");
    await settle(page);
    assert.deepEqual(await state(page), after);
    await page.waitForFunction(
      (key) => /^::[\w-]+\[Which roads\?\].*\bhidden\b/m.test(localStorage.getItem(key) ?? ""),
      storageKey,
    );
    await page.reload();
    await form(page).waitFor();
    const reloaded = await state(page);
    assert.ok(
      group(reloaded, "Which roads?")
        .filter((node) => ["question", "input", "long-answer"].includes(node.type))
        .every((node) => settings(node).hidden),
    );
    assert.ok(
      reloaded.root.children.some(
        (node) =>
          node.widget === "conditional-logic" &&
          settings(node).actions?.some(
            (action) =>
              action.type === "SHOW_BLOCKS" &&
              action.showBlocks?.includes(
                settings(targetAfter.find((item) => item.type !== "question")).field,
              ),
          ),
      ),
    );
    await openMenu(page, "Which roads?");
    await page.getByRole("menuitem", { name: /^Show\b/ }).click();
    await settle(page);
    const beforeRepair = await state(page);
    assert.ok(
      group(beforeRepair, "Which roads?")
        .filter((node) => ["question", "input", "long-answer"].includes(node.type))
        .every((node) => !settings(node).hidden),
    );
    const repair = page.getByRole("button", { name: "Hide targets initially", exact: true });
    await repair.waitFor();
    await repair.click();
    await settle(page);
    const repaired = await state(page);
    assert.ok(
      group(repaired, "Which roads?")
        .filter((node) => ["question", "input", "long-answer"].includes(node.type))
        .every((node) => settings(node).hidden),
    );
    assert.equal(await repair.count(), 0);
    await form(page).locator("[data-page-title] > [data-text]").first().click();
    await page.keyboard.press("Meta+z");
    await settle(page);
    assert.deepEqual(
      await state(page),
      beforeRepair,
      "one undo restores both visible target blocks before repair",
    );
    await page.keyboard.press("Meta+Shift+z");
    await settle(page);
    assert.deepEqual(await state(page), repaired);
    await question(page, "Which roads?").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/lexical-product-simplifications.png" });
    console.log(
      "PASS imported legacy Show targets start hidden, save/reload, and repair visible targets with atomic undo/redo",
    );
    await page.context().close();
  }

  {
    const page = await fresh();
    const fixture = await exported(page);

    const roads = fixture.blocks.find(
      (block) => block.type === "question" && block.label === "Which roads?",
    );

    const closure = fixture.blocks.find(
      (block) => block.type === "question" && block.label === "Do you need to close a road?",
    );

    assert.ok(roads && closure, "native demo contains the source and target questions");
    const rule = await addNativeRule(page, "Do you need to close a road?", "setVisible");
    await rule.getByRole("combobox", { name: "Condition", exact: true }).selectOption("selected");
    await rule.getByRole("combobox", { name: "Question", exact: true }).selectOption(closure.id);
    await rule
      .getByRole("combobox", { name: "Selected option", exact: true })
      .selectOption(closure.options.find((option) => option.label === "Yes").id);
    const beforeTarget = await state(page);
    await rule.getByRole("checkbox", { name: "Which roads?", exact: true }).check();
    await settle(page);
    const afterTarget = await state(page);

    const nativeRule = afterTarget.root.children.find((node) =>
      node.$?.native?.logic?.rules.some((rule) =>
        rule.actions.some(
          (action) => action.type === "setVisible" && action.targets.includes(roads.id),
        ),
      ),
    );

    assert.ok(nativeRule, "the native visibility action owns the selected question");
    assert.ok(
      group(afterTarget, "Which roads?")
        .filter((node) => ["question", "input", "long-answer"].includes(node.type))
        .every((node) => !settings(node).hidden),
      "editing a native action preserves the authored baseline visibility",
    );
    await form(page).locator("[data-page-title] > [data-text]").first().click();
    await page.keyboard.press("Meta+z");
    await settle(page);
    assert.deepEqual(await state(page), beforeTarget, "native target selection is one undo step");
    await page.keyboard.press("Meta+Shift+z");
    await settle(page);
    assert.deepEqual(await state(page), afterTarget);
    await openMenu(page, "Which roads?");
    await page.getByRole("menuitem", { name: /^Hide\b/ }).click();
    await settle(page);
    const hidden = await exported(page);
    assert.equal(hidden.blocks.find((block) => block.id === roads.id).visible, false);
    assert.ok(
      hidden.blocks.some(
        (block) =>
          block.type === "logic" &&
          block.rules.some((rule) =>
            rule.actions.some(
              (action) =>
                action.type === "setVisible" &&
                action.value === true &&
                action.targets.includes(roads.id),
            ),
          ),
      ),
    );
    await page.locator('[role="status"][title="Saved"]').waitFor();
    await page.reload();
    await form(page).waitFor();
    assert.deepEqual(
      await exported(page),
      hidden,
      "native baseline visibility and conditional action survive Markdown reload",
    );
    console.log(
      "PASS native visibility targets preserve their baseline, edit atomically and survive reload",
    );
    await page.context().close();
  }

  assert.deepEqual(errors, []);
  console.log(
    "PASS product simplifications in native and imported legacy forms; no browser errors",
  );
} catch (error) {
  console.error(errors);

  if (current && !current.isClosed()) {
    await current.screenshot({
      path: "/tmp/lexical-product-simplifications-failure.png",
      fullPage: true,
    });
    console.error((await current.locator("body").innerText()).slice(-6000));
  }

  throw error;
} finally {
  await browser.close();
}
