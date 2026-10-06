import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const formula = page.getByRole("textbox", { name: "Edit formula", exact: true });

const root = page.locator('[aria-label="Form"][contenteditable="true"]');

const source = `---
format: govbb-form
formatVersion: 1
title: Formula selection test
---

# Calculate a total

Safe canvas paragraph.

::number[Count]{#count}

:::calculated-fields{#totals}
\`\`\`json
{"calculatedFields":[{"id":"sum","name":"Total","type":"NUMBER","value":0}]}
\`\`\`
:::

:::logic{#logic}
\`\`\`json
{"logicalOperator":"AND","conditionals":[{"id":"c","type":"SINGLE","field":"count","comparison":"GREATER_THAN","value":0}],"actions":[{"id":"a","type":"CALCULATE","calculate":{"field":"totals:sum","operator":"FORMULA","expression":"{{count}} + 2"}}]}
\`\`\`
:::
`;

const expression = () =>
  page.evaluate(
    () =>
      document
        .querySelector('[aria-label="Form"]')
        .__lexicalEditor.getEditorState()
        .toJSON()
        .root.children.find((node) => node.widget === "conditional-logic").$?.settings?.actions?.[0]
        ?.calculate?.expression ?? "",
  );

const expectExpression = async (expected) => {
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('[aria-label="Form"]')
        .__lexicalEditor.getEditorState()
        .toJSON()
        .root.children.find((node) => node.widget === "conditional-logic").$?.settings?.actions?.[0]
        ?.calculate?.expression === expected,
    expected,
  );
};

const scopedSelection = () =>
  formula.evaluate((el) => {
    const selection = getSelection();

    return (
      !!selection?.rangeCount &&
      !selection.isCollapsed &&
      el.contains(selection.anchorNode) &&
      el.contains(selection.focusNode)
    );
  });

const clipboard = (type) =>
  formula.evaluate((el, type) => {
    const data = new DataTransfer();
    el.dispatchEvent(
      new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: data }),
    );

    return data.getData("text/plain");
  }, type);

const paste = (text) =>
  formula.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, text);

try {
  await page.goto(process.argv[2] ?? "http://localhost:3015/");
  await page.evaluate((source) => {
    localStorage.clear();
    localStorage.setItem("govbb-editor:draft:markdown:v2", source);
  }, source);
  await page.reload();
  await root.waitFor();
  await page.getByRole("button", { name: "Edit formula", exact: true }).click();
  await formula.waitFor();
  assert.equal(await expression(), "{{count}} + 2");
  const originalBlocks = await root.locator(":scope > *").count();

  await formula.locator('[data-atom="field"]').click();
  await page.keyboard.press("Meta+a");
  assert.equal(await scopedSelection(), true);
  assert.equal(await formula.locator('[data-selected="true"]').count(), 0);
  assert.equal((await clipboard("copy")).replace(/\s/g, ""), "{{count}}+2");
  await page.keyboard.type("7");
  await expectExpression("7");
  await page.keyboard.press("Control+a");
  assert.equal(await scopedSelection(), true);
  await page.keyboard.type("8 + 1");
  await expectExpression("8 + 1");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await expectExpression("");
  await paste("{{count}} + 2");
  await expectExpression("{{count}} + 2");
  await page.keyboard.press("Control+a");
  assert.equal((await clipboard("cut")).replace(/\s/g, ""), "{{count}}+2");
  await expectExpression("");
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("3");
  await expectExpression("3");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await expectExpression("");
  console.log(
    "PASS Cmd+A and Ctrl+A select only formula, clear chip selection, replace/delete/copy/cut full token content",
  );

  await paste("1 + ");
  await page.keyboard.type("@");
  await page.locator('[data-testid="formula-autocomplete"]').waitFor();
  await page.keyboard.press("Meta+a");
  await page.waitForTimeout(80);
  assert.equal(await page.locator('[data-testid="formula-autocomplete"]').count(), 0);
  assert.equal(await scopedSelection(), true);
  await page.keyboard.type("42");
  await expectExpression("42");
  assert.equal(await root.locator(":scope > *").count(), originalBlocks);
  assert.equal(await root.locator(":scope > p").first().textContent(), "Formula selection test");
  assert.equal(await root.getByText("Safe canvas paragraph.", { exact: true }).count(), 1);
  console.log(
    "PASS select-all during autocomplete cancels it and replaces the expression without changing canvas blocks",
  );

  await page.keyboard.press("Escape");
  await root.getByText("Safe canvas paragraph.", { exact: true }).click();
  await page.keyboard.press("Meta+a");
  assert.equal(
    await page.evaluate(() => {
      const root = document.querySelector('[aria-label="Form"]'),
        selection = getSelection();

      return (
        !!selection?.rangeCount &&
        !selection.isCollapsed &&
        root.contains(selection.anchorNode) &&
        root.contains(selection.focusNode)
      );
    }),
    true,
  );
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  const textarea = page.getByRole("textbox", { name: "Markdown source" });
  await textarea.click();
  await page.keyboard.press(
    (await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent)))
      ? "Meta+a"
      : "Control+a",
  );
  assert.equal(
    await textarea.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length),
    true,
  );
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await page.waitForFunction(() =>
    localStorage.getItem("govbb-editor:draft:markdown:v2")?.includes("42"),
  );
  await page.reload();
  await root.waitFor();
  assert.equal(await expression(), "42");
  assert.deepEqual(errors, []);
  console.log(
    "PASS main canvas and native source textarea keep select-all; formula changes survive Markdown reload; no browser errors",
  );
} catch (error) {
  console.log((await page.locator("body").innerText()).slice(-6000));
  await page.screenshot({ path: "/tmp/govbb-editor-formula-failure.png" });
  throw error;
} finally {
  await browser.close();
}
