import { authenticatedPage } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await authenticatedPage(browser, { viewport: { width: 1440, height: 1050 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = process.argv[2] ?? "http://localhost:3015/";

const root = page.getByRole("textbox", { name: "Form", exact: true });

const logic = page.locator("[data-native-logic]").first();

const button = (name) => page.getByRole("button", { name, exact: true });

async function exported() {
  await button("JSON").click();
  await page.getByRole("heading", { name: "Form JSON", exact: true }).waitFor();
  const event = page.waitForEvent("download");
  await button("Download JSON").click();
  const download = await event;
  const value = JSON.parse(await readFile(await download.path(), "utf8"));
  await button("Close form JSON").click();

  return value;
}

async function choose(label, option) {
  await logic.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function more(label, option) {
  await logic.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("menuitem", { name: option, exact: true }).click();
}

async function importDocument(document) {
  await button("JSON").click();
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "logic-controls.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  await button("Apply import").click();
  await page
    .getByText("Form imported. Undo returns to your previous form.", { exact: true })
    .waitFor();
  await button("Close form JSON").click();
}

async function withinViewport(locator) {
  const box = await locator.boundingBox();
  assert.ok(box);
  assert.ok(box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1, JSON.stringify(box));
}

try {
  await page.goto(url);
  await root.waitFor();
  const baseline = await exported();
  const original = baseline.blocks.find((block) => block.type === "logic");
  assert.ok(original);
  assert.equal(original.rules.length, 1);
  assert.equal(original.rules[0].when.op, "selected");
  const current = (document) => document.blocks.find((block) => block.id === original.id);
  const expected = structuredClone(original);
  const rule = expected.rules[0];
  const question = baseline.blocks.find((block) => block.id === rule.when.question);

  const other = baseline.blocks.find(
    (block) => block.type === "question" && block.id !== question.id && block.options?.length,
  );

  assert.ok(other);
  assert.match(question.label, /close a road/);
  assert.match(other.label, /\S/);
  await logic.scrollIntoViewIfNeeded();
  assert.ok((await logic.boundingBox()).height < 350, "one rule stays compact");
  assert.equal(await logic.getByText("Rule enabled", { exact: true }).count(), 0);
  await logic.getByRole("combobox", { name: "Question", exact: true }).waitFor();
  await logic.getByText("When", { exact: true }).waitFor();
  await logic.getByText("Then", { exact: true }).waitFor();

  await choose("Question", other.label);
  await choose("Selected option", other.options[0].label);
  rule.when = { ...rule.when, question: other.id, option: other.options[0].id };
  assert.deepEqual(current(await exported()), expected);
  const option = question.options.find((option) => option.id !== original.rules[0].when.option);
  assert.ok(option);
  await choose("Question", question.label);
  await choose("Selected option", option.label);
  rule.when = { ...rule.when, question: question.id, option: option.id };
  const beforeScope = await exported();
  assert.deepEqual(current(beforeScope), expected);

  assert.equal(
    await logic.getByRole("button", { name: "Condition settings", exact: true }).count(),
    0,
  );
  await logic.getByRole("combobox", { name: "Question", exact: true }).click();
  const answerScope = page.getByRole("combobox", { name: "Answer scope", exact: true });
  await answerScope.selectOption("form");
  await page.keyboard.press("Escape");
  rule.when.scope = "form";
  const afterScope = await exported();
  assert.deepEqual(current(afterScope), expected);
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(
    await exported(),
    beforeScope,
    "one undo restores the entire form before scope editing",
  );
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.deepEqual(await exported(), afterScope, "redo restores the exact edited scope");

  const targetPopup = page.getByRole("dialog", { name: "Blocks and question parts", exact: true });

  const search = page.getByRole("searchbox", {
    name: "Search blocks and question parts",
    exact: true,
  });

  const partLabel = `${question.label} — label`;
  const addedTarget = { question: question.id, part: "label" };
  await logic.getByRole("button", { name: "Blocks and question parts", exact: true }).click();
  await search.fill(question.label);
  await targetPopup.getByRole("checkbox", { name: partLabel, exact: true }).check();
  await search.fill("no matching blocks");
  assert.equal(await targetPopup.getByRole("checkbox").count(), 0);
  await page.keyboard.press("Escape");
  rule.actions[0].targets.push(addedTarget);
  assert.deepEqual(
    current(await exported()),
    expected,
    "filtering retains the other selected targets",
  );
  await choose("Action", "Hide blocks");
  rule.actions[0].value = false;
  assert.deepEqual(
    current(await exported()),
    expected,
    "switching Show to Hide retains all targets",
  );
  await logic.getByRole("button", { name: "Blocks and question parts", exact: true }).click();
  await search.fill(question.label);
  await targetPopup.getByRole("checkbox", { name: partLabel, exact: true }).uncheck();
  await page.keyboard.press("Escape");
  rule.actions[0].targets.pop();
  assert.deepEqual(current(await exported()), expected);

  await more("Rule 1 options", "Disable rule");
  rule.enabled = false;
  await logic.getByText("Disabled", { exact: true }).waitFor();
  assert.deepEqual(current(await exported()), expected);
  await more("Rule 1 options", "Duplicate rule");
  const duplicated = current(await exported());
  assert.equal(duplicated.rules.length, 2);
  const copy = duplicated.rules[1];
  assert.notEqual(copy.id, rule.id);
  assert.deepEqual({ ...copy, id: rule.id }, rule);
  await more("Rule 2 options", "Enable rule");
  copy.enabled = true;
  await more("Rule 2 options", "Move rule up");
  assert.deepEqual(current(await exported()).rules, [copy, rule]);
  await more("Rule 1 options", "Move rule down");
  assert.deepEqual(current(await exported()).rules, [rule, copy]);
  await more("Rule 2 options", "Remove rule 2");
  await more("Rule 1 options", "Enable rule");
  rule.enabled = true;
  assert.deepEqual(current(await exported()), expected);
  await more("Action 1 options", "Add action");
  await logic.getByRole("button", { name: "Action 2 options", exact: true }).waitFor();
  await more("Action 2 options", "Move action up");
  await more("Action 1 options", "Remove action 1");
  assert.deepEqual(
    current(await exported()),
    expected,
    "action menus preserve the remaining action",
  );

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await logic.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await logic.getByText("When", { exact: true }).waitFor();
    await logic.getByText("Then", { exact: true }).waitFor();
    await logic.getByRole("combobox", { name: "Question", exact: true }).click();
    await withinViewport(page.getByRole("listbox"));
    await page.keyboard.press("Escape");
    await logic.getByRole("button", { name: "Blocks and question parts", exact: true }).click();
    await withinViewport(targetPopup);
    await targetPopup
      .getByRole("heading", { name: "Blocks and question parts", exact: true })
      .waitFor();
    await search.fill(question.label);
    await targetPopup.getByRole("checkbox", { name: partLabel, exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await logic.getByRole("combobox", { name: "Question", exact: true }).click();
    await withinViewport(answerScope);
    assert.equal(await answerScope.inputValue(), "form");
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 1440, height: 1050 });
  await importDocument({
    schemaVersion: 2,
    id: "numeric-logic-controls",
    title: "Numeric logic controls",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [
      { id: "details", type: "page", role: "questions", title: "Details" },
      { id: "amount", type: "question", kind: "number", key: "amount", label: "Amount" },
      {
        id: "rate",
        type: "calculated",
        valueType: "number",
        expression: {
          op: "lookup",
          args: [{ answer: "amount" }],
          entries: [{ key: 0, value: 1 }],
          fallback: 0,
        },
      },
      {
        id: "rules",
        type: "logic",
        rules: [
          {
            id: "limit",
            when: { op: "eq", left: { answer: "amount", scope: "form" }, right: 100 },
            actions: [{ type: "setCompletionEnabled", value: false }],
          },
        ],
      },
    ],
  });

  const when = (document) => document.blocks.find((block) => block.id === "rules").rules[0].when;

  const lookupKey = (document) =>
    document.blocks.find((block) => block.id === "rate").expression.entries[0].key;

  const number = logic.getByRole("textbox", { name: "With", exact: true });
  const calculation = page.locator("[data-native-calculated]");

  const calculationSettings = page.getByRole("dialog", {
    name: "Calculation settings",
    exact: true,
  });

  const key = calculationSettings.getByLabel("Match value", { exact: true });

  for (const text of ["1.5", "0.05", "-0.05", "-1.5"]) {
    await number.fill("");
    await number.pressSequentially(text);
    assert.equal(await number.inputValue(), text, "expression input retains decimal keystrokes");
    await calculation.getByRole("button", { name: "Calculation settings", exact: true }).click();
    await key.fill("");
    await key.pressSequentially(text);
    assert.equal(await key.inputValue(), text, "literal input retains decimal keystrokes");
    await page.keyboard.press("Escape");
    const saved = await exported();
    assert.equal(when(saved).right, Number(text));
    assert.equal(lookupKey(saved), Number(text));
  }

  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(lookupKey(await exported()), -1);
  await calculation.getByRole("button", { name: "Calculation settings", exact: true }).click();
  assert.equal(
    await key.inputValue(),
    "-1",
    "undo replaces local numeric text with the restored value",
  );
  await page.keyboard.press("Escape");
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.equal(lookupKey(await exported()), -1.5);
  await calculation.getByRole("button", { name: "Calculation settings", exact: true }).click();
  assert.equal(await key.inputValue(), "-1.5");
  await page.keyboard.press("Escape");

  const beforeOperator = await exported();
  await choose("Condition", "Is not equal to");
  const afterOperator = await exported();
  assert.deepEqual(when(afterOperator), { ...when(beforeOperator), op: "ne" });
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(await exported(), beforeOperator);
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.deepEqual(await exported(), afterOperator);
  await choose("Condition", "Is at least");
  const comparison = { ...when(beforeOperator), op: "gte" };
  assert.deepEqual(
    when(await exported()),
    comparison,
    "the inline condition controls preserve the same operands",
  );

  await logic.getByRole("combobox", { name: "Compare", exact: true }).click();
  await answerScope.waitFor();
  assert.ok(
    (await answerScope.locator("option").allTextContents()).includes("Same repeated entry"),
  );
  await answerScope.selectOption("");
  await page.keyboard.press("Escape");
  assert.deepEqual(when(await exported()), {
    ...comparison,
    left: { answer: "amount" },
  });
  await logic.getByRole("combobox", { name: "Compare", exact: true }).click();
  await answerScope.selectOption("form");
  await page.keyboard.press("Escape");
  assert.deepEqual(
    when(await exported()),
    comparison,
    "operand scopes are edited in their own field picker",
  );

  await logic.getByRole("combobox", { name: "With options", exact: true }).click();
  await page.getByRole("combobox", { name: "Value source", exact: true }).selectOption("string");
  await page.keyboard.press("Escape");
  await number.fill("1.5");
  await button("JSON").click();
  await button("Download JSON").click();
  await page.getByText(/Cannot compare number with string\./).waitFor();
  await button("Close form JSON").click();
  assert.equal(
    await number.inputValue(),
    "1.5",
    "literal text remains editable without numeric coercion",
  );
  await logic.getByRole("combobox", { name: "With options", exact: true }).click();
  await page.getByRole("combobox", { name: "Value source", exact: true }).selectOption("number");
  await page.keyboard.press("Escape");
  await number.fill("-1.5");
  assert.deepEqual(
    when(await exported()),
    comparison,
    "literal types are edited in their own value picker",
  );

  const beforeWrap = await exported();
  await more("Condition options", "Wrap in group");
  const afterWrap = await exported();
  const expectedWrapped = structuredClone(beforeWrap);
  expectedWrapped.blocks.find((block) => block.id === "rules").rules[0].when = {
    op: "all",
    conditions: [comparison],
  };
  assert.deepEqual(
    afterWrap,
    expectedWrapped,
    "wrapping retains every operand, scope, ID and other document property",
  );
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(await exported(), beforeWrap, "wrapping is one undoable change");
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.deepEqual(await exported(), afterWrap);
  await more("Condition group options", "Unwrap group");
  assert.deepEqual(when(await exported()), comparison);

  await more("Condition options", "Duplicate");
  const duplicates = { op: "all", conditions: [comparison, comparison] };
  assert.deepEqual(when(await exported()), duplicates);
  await more("Condition 1 options", "Add condition");
  await logic.getByRole("combobox", { name: "Condition", exact: true }).nth(1).click();
  await page.getByRole("option", { name: "Always", exact: true }).click();
  assert.deepEqual(when(await exported()), {
    op: "all",
    conditions: [comparison, true, comparison],
  });
  await more("Condition 2 options", "Remove");
  assert.deepEqual(when(await exported()), duplicates);
  await more("Condition 1 options", "Wrap in group");
  assert.deepEqual(when(await exported()), {
    op: "all",
    conditions: [{ op: "all", conditions: [comparison] }, comparison],
  });
  await more("Condition 1 group options", "Unwrap group");
  assert.deepEqual(when(await exported()), duplicates);
  await more("Condition 2 options", "Remove");
  assert.deepEqual(when(await exported()), { op: "all", conditions: [comparison] });
  await more("Condition group options", "Unwrap group");
  assert.deepEqual(when(await exported()), comparison);

  const grouped = await exported();
  const children = [comparison, { op: "empty", value: { answer: "amount" } }];
  grouped.blocks.find((block) => block.id === "rules").rules[0].when = {
    op: "all",
    conditions: children,
  };
  await importDocument(grouped);
  await choose("Match conditions", "any");
  const groupedChanged = await exported();
  assert.deepEqual(when(groupedChanged), { op: "any", conditions: children });
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(when(await exported()), { op: "all", conditions: children });
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.deepEqual(await exported(), groupedChanged);
  await more("Condition group options", "Wrap in group");
  assert.deepEqual(when(await exported()), {
    op: "all",
    conditions: [{ op: "any", conditions: children }],
  });
  await more("Condition 1 group options", "Add condition");
  await logic.getByRole("combobox", { name: "Condition", exact: true }).last().click();
  await page.getByRole("option", { name: "Always", exact: true }).click();
  const nestedChanged = await exported();
  assert.deepEqual(when(nestedChanged), {
    op: "all",
    conditions: [{ op: "any", conditions: children }, true],
  });
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.reload();
  await root.waitFor();
  assert.deepEqual(
    await exported(),
    nestedChanged,
    "typed numbers and conditions survive source persistence",
  );

  assert.deepEqual(errors, []);
  console.log(
    "PASS native logic controls: compact pills, exact operand scope/type edits, decimal typing, nested wrap/unwrap/add/duplicate/remove, atomic undo/redo, persistence, target search, rule/action menus and narrow popovers",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/native-logic-controls-failure.png", fullPage: true });
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
