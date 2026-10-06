import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const url = process.argv[2] ?? "http://localhost:3013/";

const errors = [];

const settings = (node) => node.$?.settings ?? {};

const root = (page) => page.locator('[contenteditable="true"][aria-label="Form"]');

const state = (page) =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const settle = (page) => page.waitForTimeout(180);

const question = (page, label) =>
  root(page)
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: label }) })
    .first();

const menu = async (page, block) => {
  await block.hover({ position: { x: 150, y: 15 } });
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menu").first().waitFor();
};

let current;

try {
  for (const mode of ["delete rule", "remove target"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = (current = await context.newPage());
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await root(page).waitFor();
    await page.evaluate(() => document.fonts.ready);

    // A deliberately hidden, unrelated question must stay untouched by recovery.
    await menu(page, question(page, "Event name"));
    await page.getByRole("menuitem", { name: /^Hide\b/ }).click();
    await menu(page, question(page, "Do you need to close a road?"));
    await page.getByRole("menuitem", { name: /^Add conditional logic/ }).click();

    const rule = page
      .locator("[data-logic-block]")
      .filter({ has: page.locator('[data-logic-action=""]') })
      .last();

    await rule.getByRole("combobox", { name: "Select action", exact: true }).click();
    await page.getByRole("option", { name: "Show blocks", exact: true }).click();

    const showRule = page
      .locator("[data-logic-block]")
      .filter({ has: page.getByRole("button", { name: "Select blocks", exact: true }) });

    await showRule.getByRole("combobox", { name: "Select field", exact: true }).click();
    await page.getByRole("option", { name: "Do you need to close a road?", exact: true }).click();
    await showRule.getByRole("combobox", { name: "Select option", exact: true }).click();
    await page.getByRole("option", { name: "Yes", exact: true }).click();
    await showRule.getByRole("button", { name: "Select blocks", exact: true }).click();
    await page.getByPlaceholder("Search", { exact: true }).fill("Which roads?");
    await page.getByRole("treeitem", { name: "Which roads?", exact: true }).click();
    await page.keyboard.press("Escape");
    await settle(page);
    const before = await state(page);

    const targetIndex = before.root.children.findIndex(
      (node) =>
        node.type === "question" && node.children?.some((child) => child.text === "Which roads?"),
    );

    const targetNodes = before.root.children.slice(targetIndex, targetIndex + 2);
    assert.ok(targetNodes.every((node) => settings(node).hidden));
    const targetIds = new Set(targetNodes.map((node) => node.$.id));
    const target = question(page, "Which roads?");
    const recovery = () => target.getByRole("button", { name: /^Make.*visible/ });
    assert.equal(await recovery().count(), 0, "a question with Show coverage needs no recovery");

    const ruleNode = before.root.children.find(
      (node) =>
        node.widget === "conditional-logic" &&
        settings(node).actions?.some((action) =>
          action.showBlocks?.includes(settings(targetNodes[1]).field),
        ),
    );

    assert.ok(ruleNode);
    const ruleIndex = before.root.children.indexOf(ruleNode);
    const ruleBlock = root(page).locator(":scope > *").nth(ruleIndex);

    if (mode === "delete rule") {
      await menu(page, ruleBlock);
      await page.getByRole("menuitem", { name: /^Delete/ }).click();
    } else {
      await ruleBlock.locator('[aria-haspopup="tree"]').click();
      await page.getByPlaceholder("Search", { exact: true }).fill("Which roads?");
      await page.getByRole("treeitem", { name: "Which roads?", exact: true }).click();
      await page.keyboard.press("Escape");
    }

    await recovery().waitFor();
    assert.match(await target.innerText(), /hidden.*without a Show rule/i);
    const orphaned = await state(page);
    assert.ok(
      orphaned.root.children
        .filter((node) => targetIds.has(node.$?.id))
        .every((node) => settings(node).hidden),
      "removing logic never reveals content automatically",
    );

    await root(page).locator("[data-page-title] > [data-text]").first().click();
    await page.keyboard.press("Meta+z");
    await settle(page);
    assert.deepEqual(await state(page), before, "undo restores the rule and its coverage");
    assert.equal(await recovery().count(), 0);
    await page.keyboard.press("Meta+Shift+z");
    await recovery().waitFor();
    await page.waitForTimeout(700);
    await page.reload();
    await root(page).waitFor();
    await recovery().waitFor();
    const loaded = await state(page);
    const unaffected = loaded.root.children.filter((node) => !targetIds.has(node.$?.id));
    await recovery().focus();
    await page.keyboard.press("Enter");
    await settle(page);
    const visible = await state(page);
    assert.ok(
      visible.root.children
        .filter((node) => targetIds.has(node.$?.id))
        .every((node) => !settings(node).hidden),
    );
    assert.deepEqual(
      visible.root.children.filter((node) => !targetIds.has(node.$?.id)),
      unaffected,
      "recovery changes no other block or rule",
    );
    assert.equal(await recovery().count(), 0);
    await root(page).locator("[data-page-title] > [data-text]").first().click();
    await page.keyboard.press("Meta+z");
    await recovery().waitFor();
    assert.deepEqual(await state(page), loaded, "Make visible is one undo step");

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await target.scrollIntoViewIfNeeded();
      assert.ok(await recovery().isVisible());
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    }

    await page.screenshot({ path: `/tmp/lexical-show-recovery-${mode.replaceAll(" ", "-")}.png` });
    await page.keyboard.press("Meta+Shift+z");
    await settle(page);
    assert.deepEqual(await state(page), visible);
    await page.waitForTimeout(700);
    await page.reload();
    await root(page).waitFor();
    assert.equal(await recovery().count(), 0);
    assert.ok(
      (await state(page)).root.children
        .filter((node) => targetIds.has(node.$?.id))
        .every((node) => !settings(node).hidden),
    );
    console.log(
      `PASS ${mode}: explicit recovery, keyboard, undo/redo, reload, untouched other blocks and mobile`,
    );
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log("PASS Show-rule recovery; no browser errors");
} catch (error) {
  if (current && !current.isClosed())
    await current.screenshot({ path: "/tmp/lexical-show-recovery-failure.png", fullPage: true });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
