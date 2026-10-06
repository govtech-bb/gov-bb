import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = process.argv[2] ?? "http://localhost:3014/";

const root = page.getByRole("textbox", { name: "Form", exact: true });

const json = () => page.getByRole("button", { name: "JSON", exact: true });

const openJson = async () => {
  await json().click();
  await page.getByRole("heading", { name: "Form JSON", exact: true }).waitFor();
};

const closeJson = () => page.getByRole("button", { name: "Close form JSON", exact: true }).click();

async function exported() {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const download = await event;

  return JSON.parse(await readFile(await download.path(), "utf8"));
}

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[contenteditable="true"][aria-label="Form"]').waitFor();
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await openJson();
  const demo = await exported();
  assert.equal(demo.schemaVersion, 2);
  assert.match(demo.title, /loud music/i);

  const pensionSource = await readFile(
    new URL("../../tests/fixtures/forms/v2/pension.json", import.meta.url),
    "utf8",
  );

  const birthSource = await readFile(
    new URL("../../tests/fixtures/forms/v2/get-birth-certificate.json", import.meta.url),
    "utf8",
  );

  const openFile = (name, source) =>
    page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(source),
    });

  const applyImport = page.getByRole("button", { name: "Apply import", exact: true });
  const openedFile = page.getByRole("textbox", { name: "Opened form JSON", exact: true });
  await openFile("pension.json", pensionSource);
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  assert.equal(await openedFile.inputValue(), pensionSource);
  await page.evaluate(() => {
    window.nativeUploadReads = [];
    window.nativeOriginalFileText = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve, reject) =>
        window.nativeUploadReads.push({
          resolve: () => window.nativeOriginalFileText.call(this).then(resolve),
          reject,
        }),
      );
    };
  });

  try {
    await openFile("birth.json", birthSource);
    await page.getByText("Reading form JSON…", { exact: true }).waitFor();
    assert.equal(await applyImport.isDisabled(), true, "a new read invalidates the staged import");
    assert.equal(await openedFile.count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Download opened file", exact: true }).count(),
      0,
    );
    await page.evaluate(() =>
      window.nativeUploadReads.shift().reject(new Error("Simulated file read failure")),
    );
    await page.getByText("The file could not be read. Open it again.", { exact: true }).waitFor();
    assert.equal(await applyImport.isDisabled(), true, "a failed read cannot revive the old file");
    assert.equal(await openedFile.count(), 0);
    assert.deepEqual(await exported(), demo, "failed uploads leave the saved form unchanged");

    await openFile("older.json", pensionSource);
    await openFile("newer.json", birthSource);
    assert.equal(await applyImport.isDisabled(), true);
    await page.evaluate(() => window.nativeUploadReads.pop().resolve());
    await page.getByText("Ready to review and apply", { exact: true }).waitFor();
    assert.equal(await openedFile.inputValue(), birthSource);
    await page.evaluate(() => window.nativeUploadReads.shift().resolve());
    assert.equal(
      await openedFile.inputValue(),
      birthSource,
      "a late read cannot replace the latest file",
    );
    const originalDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download opened file", exact: true }).click();
    assert.equal(await readFile(await (await originalDownload).path(), "utf8"), birthSource);
    await applyImport.click();
    await page
      .getByText("Form imported. Undo returns to your previous form.", { exact: true })
      .waitFor();
    assert.equal((await exported()).id, JSON.parse(birthSource).id);
  } finally {
    await page.evaluate(() => {
      File.prototype.text = window.nativeOriginalFileText;
      delete window.nativeOriginalFileText;
      delete window.nativeUploadReads;
    });
  }

  for (const name of [
    "reserve-society-name",
    "get-birth-certificate",
    "get-marriage-certificate",
    "get-death-certificate",
    "severance",
    "pension",
    "nis",
  ]) {
    const source = await readFile(
      new URL(`../../tests/fixtures/forms/v2/${name}.json`, import.meta.url),
      "utf8",
    );

    const expected = JSON.parse(source);
    await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
      name: `${name}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(source),
    });
    await page.getByText("Ready to review and apply", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "Opened form JSON", exact: true }).inputValue(),
      source,
    );
    await page.getByRole("button", { name: "Apply import", exact: true }).click();
    await page
      .getByText("Form imported. Undo returns to your previous form.", { exact: true })
      .waitFor();
    const actual = await exported();
    assert.equal(actual.id, expected.id);
    assert.equal(actual.blocks.length, expected.blocks.length);
    assert.deepEqual(
      actual.blocks
        .filter((block) => block.type === "question")
        .map((block) => [block.id, block.key, block.options?.map((option) => option.value)]),
      expected.blocks
        .filter((block) => block.type === "question")
        .map((block) => [block.id, block.key, block.options?.map((option) => option.value)]),
    );
    await closeJson();

    if (expected.blocks.some((block) => block.type === "page" && block.role === "review")) {
      const preview = root
        .locator("[data-native-preview]")
        .filter({ hasText: "Preview of answers from your pages" });

      await preview.waitFor();
      assert.equal(
        await preview.evaluate(
          (element) => !!element.closest("[data-page-title], [data-page-description]"),
        ),
        true,
        "review preview follows its editable page heading",
      );
      assert.equal(
        await root.getByRole("heading", { name: "Check your answers", exact: true }).count(),
        1,
        "the generated preview does not duplicate the editable heading",
      );
    }

    await page.reload();
    await page.locator('[contenteditable="true"][aria-label="Form"]').waitFor();
    await openJson();
    assert.deepEqual(await exported(), actual);
  }

  const before = await exported();
  const broken = '  {"schemaVersion": 99}\n';
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from(broken),
  });
  await page
    .getByText("The file was retained. Correct its errors before importing it.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Opened form JSON", exact: true }).inputValue(),
    broken,
  );
  assert.equal(
    await page.getByRole("button", { name: "Apply import", exact: true }).isDisabled(),
    true,
  );
  assert.deepEqual(await exported(), before);
  await closeJson();
  await page.getByRole("button", { name: /^Markdown/ }).click();
  const markdown = page.getByRole("textbox", { name: "Markdown source", exact: true });
  const original = await markdown.inputValue();
  await markdown.fill(original + "\nUnapplied source retained\n");
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await openJson();
  assert.equal(
    await page.getByRole("button", { name: "Apply import", exact: true }).isDisabled(),
    true,
  );
  await page
    .getByText("Apply or discard your Markdown changes before importing or exporting JSON", {
      exact: true,
    })
    .waitFor();
  await closeJson();
  const previousDocument = page.url();
  await page.getByRole("button", { name: "Create service", exact: true }).click();
  await page.getByLabel("Service name", { exact: true }).fill("Registry copy");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create service", exact: true })
    .click();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page
    .getByLabel("Document type")
    .selectOption({ label: "Loud music permit — form from registry" });
  await page.getByRole("dialog").getByRole("button", { name: "Add document", exact: true }).click();
  await page.locator('[contenteditable="true"][aria-label="Form"]').waitFor();
  await openJson();
  assert.match((await exported()).title, /loud music/i);
  await closeJson();
  await page.goto(previousDocument);
  await page.getByRole("button", { name: /^Markdown/ }).click();
  assert.match(await markdown.inputValue(), /Unapplied source retained/);
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();

  // Edit a small native calculator through the actual authoring controls.
  const editable = {
    schemaVersion: 2,
    id: "browser-native-editing",
    title: "Native editing",
    mode: "calculator",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "preview", hiddenAnswers: "retain" },
    blocks: [
      { id: "questions", type: "page", role: "questions", title: "Payment details" },
      {
        id: "include",
        type: "question",
        kind: "boolean",
        key: "include",
        label: "Include supplement?",
        default: false,
      },
      { id: "amount", type: "question", kind: "number", key: "amount", label: "Base payment" },
      {
        id: "frequency",
        type: "question",
        kind: "choice",
        key: "frequency",
        label: "Payment frequency",
        config: { selection: "single", presentation: "radio" },
        options: [
          { id: "monthly", label: "Monthly", value: "month" },
          { id: "weekly", label: "Weekly", value: "week" },
        ],
      },
      {
        id: "total",
        type: "calculated",
        name: "Payment total",
        valueType: "number",
        key: "total",
        expression: { op: "add", args: [{ answer: "amount" }, 10] },
      },
      { id: "result", type: "page", role: "result", title: "Calculation result" },
      {
        id: "summary",
        type: "content",
        kind: "paragraph",
        content: [
          "Total: ",
          { value: "total", format: { type: "currency", currency: "BBD", fractionDigits: 2 } },
        ],
      },
    ],
  };

  await openJson();
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "native-editing.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(editable)),
  });
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await page
    .getByText("Form imported. Undo returns to your previous form.", { exact: true })
    .waitFor();
  await closeJson();

  const canvasExport = async () => {
    await openJson();
    const result = await exported();
    await closeJson();

    return result;
  };

  assert.equal(
    await root.getByRole("switch", { name: "Confirmation page", exact: true }).count(),
    0,
    "calculator result page keeps its purpose instead of offering a confirmation switch",
  );
  assert.equal(
    await page.getByRole("button", { name: "Submit", exact: true }).count(),
    0,
    "calculator result pages do not preview a submission button",
  );

  const replaceLine = async (locator, value) => {
    await locator.click();
    await locator.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.insertText(value);
  };

  await replaceLine(
    root.getByRole("heading", { name: "Include supplement?", exact: true }),
    "Add a supplement?",
  );
  await replaceLine(
    root.locator("[data-page-title] [data-text]").filter({ hasText: "Calculation result" }),
    "Your payment estimate",
  );
  const calculation = page.locator("[data-native-calculated]");
  await calculation.getByLabel("Name", { exact: true }).fill("Estimated payment");
  await calculation.getByRole("button", { name: "Calculation settings", exact: true }).click();

  const calculationSettings = page.getByRole("dialog", {
    name: "Calculation settings",
    exact: true,
  });

  await calculationSettings
    .getByRole("combobox", { name: /^Value source/ })
    .first()
    .selectOption("subtract");
  const firstArgument = calculationSettings.getByRole("group", { name: "Value 1", exact: true });
  const secondArgument = calculationSettings.getByRole("group", { name: "Value 2", exact: true });
  await firstArgument.getByRole("combobox", { name: /^Value source/ }).selectOption("answer");
  await firstArgument.getByRole("combobox", { name: /^Reference(?! type)/ }).selectOption("amount");
  await firstArgument.getByRole("combobox", { name: /^Answer scope/ }).selectOption("form");
  await secondArgument.getByLabel("Number", { exact: true }).fill("17.75");
  await page.keyboard.press("Escape");
  const edited = await canvasExport();
  assert.equal(edited.blocks.find((block) => block.id === "include").label, "Add a supplement?");
  assert.equal(edited.blocks.find((block) => block.id === "include").default, false);
  assert.equal(edited.blocks.find((block) => block.id === "result").title, "Your payment estimate");
  assert.deepEqual(
    edited.blocks.find((block) => block.id === "total"),
    {
      ...editable.blocks.find((block) => block.id === "total"),
      name: "Estimated payment",
      expression: { op: "subtract", args: [{ answer: "amount", scope: "form" }, 17.75] },
    },
  );
  const choiceTitle = () => root.getByRole("heading", { name: "Payment frequency", exact: true });
  await choiceTitle().first().hover();
  await page.getByRole("button", { name: "Move this block by dragging", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Duplicate/ }).click();

  const copied = await canvasExport(),
    copiedChoice = copied.blocks.find(
      (block) => block.type === "question" && block.kind === "choice" && block.id !== "frequency",
    );

  assert.ok(copiedChoice);
  assert.notEqual(copiedChoice.key, "frequency");
  assert.deepEqual(
    copiedChoice.options.map((option) => option.value),
    ["month", "week"],
  );
  assert.notDeepEqual(
    copiedChoice.options.map((option) => option.id),
    ["monthly", "weekly"],
  );
  await choiceTitle().first().click();
  await page.keyboard.press("Meta+z");
  assert.deepEqual(
    await canvasExport(),
    edited,
    "one undo removes the copied question and identities",
  );
  await choiceTitle().first().click();
  await page.keyboard.press("Meta+Shift+z");
  assert.deepEqual(await canvasExport(), copied, "redo restores the same native copy identities");
  await root.locator("[data-option] [data-text]").first().click();
  await root.locator("[data-option]").first().hover();
  await page
    .getByRole("button", { name: "Delete this block", exact: true })
    .click({ modifiers: ["Alt"] });
  const removed = await canvasExport();
  const remainingChoice = removed.blocks.find((block) => block.id === "frequency");
  assert.equal(remainingChoice.key, "frequency");
  assert.deepEqual(remainingChoice.options, [{ id: "weekly", label: "Weekly", value: "week" }]);
  assert.deepEqual(
    removed.blocks.find((block) => block.id === copiedChoice.id),
    copiedChoice,
  );
  await choiceTitle().first().click();
  await page.keyboard.press("Meta+z");
  assert.deepEqual(
    await canvasExport(),
    copied,
    "undo restores the first option and its original typed value",
  );
  await choiceTitle().first().click();
  await page.keyboard.press("Meta+Shift+z");
  assert.deepEqual(await canvasExport(), removed);
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.reload();
  await root.waitFor();
  assert.deepEqual(
    await canvasExport(),
    removed,
    "real edits and native identities survive Markdown persistence",
  );
  await root.getByRole("heading", { name: "Base payment", exact: true }).hover();
  await page.getByRole("button", { name: "Delete this block", exact: true }).click();
  await openJson();
  const blockedDownloads = [];
  page.on("download", (download) => blockedDownloads.push(download));
  await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  await page
    .getByRole("list", { name: "JSON diagnostics" })
    .getByText(/Unknown answer reference: amount/)
    .waitFor();
  assert.equal(
    blockedDownloads.length,
    0,
    "broken references block JSON export without discarding the draft",
  );
  await closeJson();
  assert.deepEqual(errors, []);
  console.log(
    "PASS native JSON actual App: seven complete fixtures, review heading order, download/import/reload, consecutive/delayed/failed/out-of-order uploads, failed input retention, dirty source gating, independent registry form, retained source, boolean/result edits, calculations, copy/delete-first-option, undo/redo, export diagnostics and reload",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/lexical-native-form-failure.png", fullPage: true });
  console.error((await page.locator("body").innerText()).slice(0, 6000));
  console.error(
    await page.locator("[data-native-calculated] select").evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.id,
        labels: [...element.labels].map((label) => label.textContent),
        value: element.value,
      })),
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
