import { authenticatedContext } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1050 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

page.setDefaultTimeout(10000);

const url = process.argv[2] ?? "http://localhost:3015/";

const button = (name) => page.getByRole("button", { name, exact: true });

const root = page.getByRole("textbox", { name: "Form", exact: true });

const form = {
  schemaVersion: 2,
  id: "native-field-controls",
  title: "Field controls",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "draft", hiddenAnswers: "retain" },
  blocks: [
    { id: "page", type: "page", role: "questions", title: "Details" },
    {
      id: "amount",
      type: "question",
      kind: "number",
      key: "amount",
      label: "Amount",
      required: { value: true, message: "Give the amount" },
      validation: [
        {
          id: "ten",
          type: "minimum",
          value: 10,
          inclusive: true,
          message: "Original minimum message",
        },
      ],
    },
    {
      id: "date",
      type: "question",
      kind: "date",
      key: "date",
      label: "Date of birth",
      validation: [
        { id: "past", type: "dateBefore", value: { context: "today" }, message: "Use a past date" },
        {
          id: "cutoff",
          type: "dateBefore",
          value: "2026-01-01",
          inclusive: true,
          message: "Use the cutoff date",
        },
      ],
    },
    {
      id: "file",
      type: "question",
      kind: "file",
      key: "file",
      label: "Evidence",
      validation: [
        {
          id: "size",
          type: "maxFileSize",
          value: 5,
          unit: "MB",
          message: "Use a file under five megabytes",
        },
      ],
    },
    {
      id: "numeric",
      type: "question",
      kind: "choice",
      key: "numeric",
      label: "Choose amount",
      config: { selection: "multiple" },
      validation: [
        { id: "pick-two", type: "minSelections", value: 2, message: "Choose two amounts" },
      ],
      options: [
        { id: "zero", value: 0, label: "Zero" },
        { id: "five", value: 5, label: "Five" },
      ],
    },
    {
      id: "boolean",
      type: "question",
      kind: "choice",
      key: "boolean",
      label: "Choose flag",
      config: { selection: "single" },
      options: [{ id: "flag", value: false, label: "Flag" }],
    },
    {
      id: "text",
      type: "question",
      kind: "choice",
      key: "text",
      label: "Choose code",
      config: { selection: "single" },
      options: [
        { id: "first", value: "0", label: "First" },
        { id: "second", value: "5", label: "Second" },
      ],
    },
  ],
};

async function closeMenus() {
  for (let i = 0; i < 5 && (await page.getByRole("menu").count()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
  }
}

async function menu(label, submenu) {
  await closeMenus();
  await root.getByRole("heading", { name: label, exact: true }).hover();
  await button("Move this block by dragging").click();
  await page.getByRole("menuitem", { name: new RegExp(`^${submenu}`) }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menu").last().waitFor();

  return page.getByRole("menu").last().locator("input");
}

async function exported() {
  await closeMenus();
  await button("JSON").click();
  const event = page.waitForEvent("download");
  await button("Download JSON").click();
  const download = await event;
  const value = JSON.parse(await readFile(await download.path(), "utf8"));
  await button("Close form JSON").click();

  return value;
}

const question = (value, id) => value.blocks.find((block) => block.id === id);

async function undo() {
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+z");
}

async function redo() {
  await root.getByRole("heading").first().click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
}

try {
  await page.goto(url);
  await root.waitFor();
  await button("JSON").click();
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "field-controls.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(form)),
  });
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  await button("Apply import").click();
  await page
    .getByText("Form imported. Undo returns to your previous form.", { exact: true })
    .waitFor();
  await button("Close form JSON").click();
  const before = await exported();

  let inputs = await menu("Amount", "Error messages");
  assert.deepEqual(await inputs.evaluateAll((fields) => fields.map((field) => field.value)), [
    "Give the amount",
    "Original minimum message",
  ]);
  await inputs.nth(1).fill("Use at least ten");
  const edited = await exported();
  assert.equal(question(edited, "amount").validation[0].message, "Use at least ten");
  await undo();
  assert.deepEqual(await exported(), before, "Undo restores the original validation message");
  await redo();
  assert.deepEqual(await exported(), edited);

  inputs = await menu("Amount", "Error messages");
  await inputs.first().fill("");
  await inputs.nth(1).fill("");
  const reset = question(await exported(), "amount");
  assert.equal(reset.required.message, "Enter amount");
  assert.equal(reset.validation[0].message, "Amount must be 10 or more");
  inputs = await menu("Amount", "Error messages");
  assert.deepEqual(await inputs.evaluateAll((fields) => fields.map((field) => field.value)), [
    "Enter amount",
    "Amount must be 10 or more",
  ]);

  inputs = await menu("Date of birth", "Error messages");
  assert.deepEqual(await inputs.evaluateAll((fields) => fields.map((field) => field.value)), [
    "Use a past date",
    "Use the cutoff date",
  ]);
  await inputs.nth(1).fill("Choose before the deadline");
  assert.deepEqual(
    question(await exported(), "date").validation.map((rule) => rule.message),
    ["Use a past date", "Choose before the deadline"],
  );

  inputs = await menu("Evidence", "Error messages");
  assert.equal(await inputs.first().inputValue(), "Use a file under five megabytes");
  await inputs.first().fill("Use a smaller document");
  assert.equal(question(await exported(), "file").validation[0].message, "Use a smaller document");

  inputs = await menu("Choose amount", "Error messages");
  assert.equal(await inputs.first().inputValue(), "Choose two amounts");
  await inputs.first().fill("Choose both amounts");
  assert.equal(question(await exported(), "numeric").validation[0].message, "Choose both amounts");

  const beforeOption = await exported();
  inputs = await menu("Choose amount", "Option values");
  assert.deepEqual(await inputs.evaluateAll((fields) => fields.map((field) => field.value)), [
    "0",
    "5",
  ]);
  await inputs.first().fill("2");
  const afterOption = await exported();
  assert.deepEqual(
    question(afterOption, "numeric").options.map((option) => option.value),
    [2, 5],
  );
  await undo();
  assert.deepEqual(await exported(), beforeOption);
  await redo();
  assert.deepEqual(await exported(), afterOption);

  for (const value of ["1.5", "0.05", "-1.5"]) {
    inputs = await menu("Choose amount", "Option values");
    await inputs.first().fill("");
    await inputs.first().pressSequentially(value);
    assert.equal(await inputs.first().inputValue(), value);
    assert.equal(question(await exported(), "numeric").options[0].value, Number(value));
  }

  for (const invalid of ["5.0", "not a number", ""]) {
    inputs = await menu("Choose amount", "Option values");
    await inputs.first().fill(invalid);
    assert.equal(await inputs.first().getAttribute("aria-invalid"), "true");

    if (invalid === "5.0")
      await page.getByText("Another option already uses this value", { exact: true }).waitFor();
    assert.equal(
      question(await exported(), "numeric").options[0].value,
      -1.5,
      "Invalid values must not corrupt stored options",
    );
  }

  inputs = await menu("Choose flag", "Option values");
  assert.equal(await inputs.first().inputValue(), "false");
  await inputs.first().fill("true");
  assert.equal(question(await exported(), "boolean").options[0].value, true);
  inputs = await menu("Choose flag", "Option values");
  await inputs.first().fill("maybe");
  assert.equal(await inputs.first().getAttribute("aria-invalid"), "true");
  assert.equal(question(await exported(), "boolean").options[0].value, true);

  inputs = await menu("Choose code", "Option values");
  assert.equal(await inputs.first().inputValue(), "0");
  await inputs.first().fill("2");
  const persisted = await exported();
  assert.equal(question(persisted, "text").options[0].value, "2");
  await page.waitForTimeout(1000);
  await page.reload();
  await root.waitFor();
  assert.deepEqual(await exported(), persisted, "Field edits survive Markdown autosave and reload");
  assert.deepEqual(errors, []);
  console.log(
    "Native field controls: custom messages, per-rule edits/reset, typed option values, duplicate/invalid rejection, Undo/Redo, export and reload passed.",
  );
} finally {
  await context.close();
  await browser.close();
}
