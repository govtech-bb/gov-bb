import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const root = page.getByRole("textbox", { name: "Form", exact: true });

const calculation = page.locator("[data-native-calculated]").first();

const formula = page.getByRole("textbox", { name: "Edit formula", exact: true });

const button = (name) => page.getByRole("button", { name, exact: true });

const total = (document) => document.blocks.find((block) => block.id === "total");

const originalExpression = { op: "multiply", args: [{ answer: "amount", scope: "form" }, 0.05] };

const unnamedId = "63c6eaf1-4f49-4a22-990e-c69286f65f14";

const fixture = {
  schemaVersion: 2,
  id: "native-formula-browser",
  title: "Native formula editing",
  mode: "calculator",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "preview", hiddenAnswers: "retain" },
  blocks: [
    { id: "details", type: "page", role: "questions", title: "Payment details" },
    { id: "amount", type: "question", kind: "number", key: "amount", label: "Amount" },
    {
      id: "total",
      type: "calculated",
      name: "Total",
      key: "total",
      valueType: "number",
      expression: originalExpression,
    },
    { id: unnamedId, type: "calculated", valueType: "number", expression: 0 },
    { id: "result", type: "page", role: "result", title: "Your estimate" },
    { id: "summary", type: "content", kind: "paragraph", content: ["Total: ", { value: "total" }] },
  ],
};

async function exported() {
  await button("JSON").click();
  await page.getByRole("heading", { name: "Form JSON", exact: true }).waitFor();
  const event = page.waitForEvent("download");
  await button("Download JSON").click();
  const download = await event;
  const document = JSON.parse(await readFile(await download.path(), "utf8"));
  await button("Close form JSON").click();

  return document;
}

async function importFixture() {
  await button("JSON").click();
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "native-formula.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  await button("Apply import").click();
  await page
    .getByText("Form imported. Undo returns to your previous form.", { exact: true })
    .waitFor();
  await button("Close form JSON").click();
}

async function openFormula() {
  await calculation.getByRole("button", { name: "Edit formula", exact: true }).click();
  await formula.waitFor();
}

async function selectFormula() {
  await formula.click();
  await page.keyboard.press("ControlOrMeta+a");
}

const copyFormula = () =>
  formula.evaluate((element) => {
    const data = new DataTransfer();
    element.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data }),
    );

    return data.getData("text/plain");
  });

const paste = (text) =>
  formula.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, text);

async function withinViewport(locator, name) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  assert.ok(box, `${name} is visible`);
  assert.ok(
    box.x >= -1 && box.x + box.width <= viewport.width + 1,
    `${name} fits horizontally at ${viewport.width}px: ${JSON.stringify(box)}`,
  );
  assert.ok(
    box.y >= -1 && box.y + box.height <= viewport.height + 1,
    `${name} fits vertically at ${viewport.width}px: ${JSON.stringify(box)}`,
  );
}

async function noOverflow() {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    `document fits at ${page.viewportSize().width}px`,
  );
}

try {
  await page.goto(process.argv[2] ?? "http://localhost:3015/");
  await root.waitFor();
  await importFixture();
  const baseline = await exported();
  assert.deepEqual(total(baseline).expression, originalExpression);
  await openFormula();
  await formula
    .locator('[data-atom="field"]')
    .getByText("Amount (whole form)", { exact: true })
    .waitFor();
  assert.deepEqual(
    await exported(),
    baseline,
    "opening a formula cannot normalize its native tree",
  );

  await openFormula();
  await formula.locator('[data-token="num"]').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText("0.125");
  await formula.locator('[data-token="num"]').getByText("0.125", { exact: true }).waitFor();
  await selectFormula();
  const scopedCopy = await copyFormula();
  assert.match(scopedCopy, /\{\{[^}]+\}\}/, "copied formulas retain an atomic reference");
  const scopedEdit = await exported();
  const expectedScoped = structuredClone(baseline);
  total(expectedScoped).expression.args[1] = 0.125;
  assert.deepEqual(
    scopedEdit,
    expectedScoped,
    "numeric token editing preserves the reference scope",
  );
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(await exported(), baseline, "one undo restores the exact original formula");
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.deepEqual(await exported(), scopedEdit, "redo restores the exact scoped formula");
  await openFormula();
  await formula.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await formula.locator('[data-token="num"]').getByText("0.05", { exact: true }).waitFor();
  assert.deepEqual(await exported(), baseline, "undo works while the formula popup has focus");
  await openFormula();
  await formula.focus();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await formula.locator('[data-token="num"]').getByText("0.125", { exact: true }).waitFor();
  assert.deepEqual(await exported(), scopedEdit, "redo refreshes the focused formula popup");
  await openFormula();
  await formula.focus();
  await page.keyboard.press("Control+z");
  await formula.locator('[data-token="num"]').getByText("0.05", { exact: true }).waitFor();
  await page.keyboard.press("Control+y");
  await formula.locator('[data-token="num"]').getByText("0.125", { exact: true }).waitFor();
  assert.deepEqual(await exported(), scopedEdit, "Ctrl+Y restores the focused native formula");
  console.log("PASS scoped token editing, no-op round trip and exact undo/redo");

  await openFormula();
  await selectFormula();
  await paste("{{not_registered}} + 1");
  await calculation.getByRole("alert").waitFor();
  assert.deepEqual(
    await exported(),
    scopedEdit,
    "an invalid reference remains a local draft and cannot replace the native calculation",
  );
  await openFormula();
  await selectFormula();
  await paste(scopedCopy);
  await calculation.getByRole("alert").waitFor({ state: "hidden" });
  assert.deepEqual(await exported(), scopedEdit, "repairing from copied tokens retains the scope");
  await openFormula();
  await selectFormula();
  await page.keyboard.type("0.75");
  const literalEdit = await exported();
  assert.equal(total(literalEdit).expression, 0.75, "fraction typing produces a numeric literal");
  console.log("PASS invalid drafts, scoped token repair and decimal literal typing");

  await openFormula();
  await selectFormula();
  await page.keyboard.type("@");
  const autocomplete = page.getByTestId("formula-autocomplete");
  await autocomplete.waitFor();
  await page.keyboard.type("Amount");
  await autocomplete.getByText("Amount", { exact: true }).waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await autocomplete.waitFor({ state: "hidden" });
  await page.keyboard.type(" * 0.25");
  const mentioned = await exported();
  assert.deepEqual(total(mentioned).expression, {
    op: "multiply",
    args: [{ answer: "amount" }, 0.25],
  });
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.reload();
  await root.waitFor();
  assert.deepEqual(await exported(), mentioned, "formula mentions and fractions survive reload");
  await openFormula();
  await selectFormula();
  await paste("{{not_registered}} + 1");
  await calculation.getByRole("alert").waitFor();
  await page.keyboard.press("ControlOrMeta+z");
  await calculation.getByRole("alert").waitFor({ state: "hidden" });
  assert.deepEqual(
    await exported(),
    mentioned,
    "undo with empty history clears an invalid local draft without changing the stored formula",
  );
  console.log("PASS keyboard field mentions and exact native export after reload");

  const unnamed = page.locator("[data-native-calculated]").nth(1);
  const blankName = unnamed.getByRole("textbox", { name: "Name", exact: true });
  assert.equal(await blankName.inputValue(), "");
  assert.equal(await blankName.getAttribute("placeholder"), "Field name");
  assert.equal((await unnamed.innerText()).includes(unnamedId), false);
  const longName = "An unusually long calculated value name ".repeat(5);
  await calculation.getByRole("textbox", { name: "Name", exact: true }).fill(longName);
  const mobileFailures = [];

  const checkContained = async (locator, name) => {
    try {
      await withinViewport(locator, name);
    } catch (error) {
      mobileFailures.push(error.message);
    }
  };

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await calculation.scrollIntoViewIfNeeded();
    await noOverflow();
    await checkContained(calculation.getByRole("textbox", { name: "Name", exact: true }), "Name");
    await openFormula();
    await formula.scrollIntoViewIfNeeded();
    await checkContained(formula, "Formula editor");
    await checkContained(button("Reference a field"), "Reference control");
    await checkContained(button("Close group"), "Formula operator controls");
    await formula.focus();
    await page.keyboard.type("@");
    await autocomplete.waitFor();
    await checkContained(autocomplete, "Field autocomplete");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await formula.waitFor({ state: "hidden" });
    await calculation.getByRole("button", { name: "Calculation settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Calculation settings", exact: true });
    await settings.waitFor();
    await checkContained(settings, "Calculation settings");
    const scope = settings.getByRole("combobox", { name: /^Answer scope/ });
    await scope.scrollIntoViewIfNeeded();
    await scope.focus();
    assert.equal(await scope.inputValue(), "");

    const submitted = settings.getByRole("checkbox", {
      name: "Include this value with submitted answers",
      exact: true,
    });

    await submitted.scrollIntoViewIfNeeded();
    assert.equal(await submitted.isVisible(), true, "all calculation settings remain reachable");
    await checkContained(submitted, "Submission control");
    await page.keyboard.press("Escape");
    await noOverflow();
  }

  assert.deepEqual(errors, []);
  assert.equal(mobileFailures.length, 0, mobileFailures.join("\n"));
  console.log(
    "PASS 320/390px formula, autocomplete and settings; long names; unnamed field labels",
  );
} finally {
  await browser.close();
}
