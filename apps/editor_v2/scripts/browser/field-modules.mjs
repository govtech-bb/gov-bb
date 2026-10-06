import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const url = process.argv[2];

assert.ok(url && /^https?:\/\//.test(url), "Pass an explicit server URL");

const storageKey = "govbb-editor:draft:markdown:v2";

const browser = await chromium.launch();

let current;

const errors = [];

const settings = (node) => node.$?.settings ?? {};

const text = (node) => node.text ?? node.children?.map(text).join("") ?? "";

const form = (page) => page.locator('[contenteditable="true"][aria-label="Form"]');

const state = (page) =>
  page.evaluate(() =>
    document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
  );

const isAnswer = (node, kind) =>
  kind === "text"
    ? node.type === "input" && (node.kind ?? "text") === kind
    : node.type === "widget" && node.widget === kind;

const question = (page, label) =>
  form(page)
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: label }) })
    .first();

const answer = (document, label, kind) => {
  const nodes = document.root.children;
  const index = nodes.findIndex((node) => node.type === "question" && text(node) === label);
  assert.ok(index >= 0, `question exists: ${label}`);
  const next = nodes[index + 1];
  assert.ok(next && isAnswer(next, kind), `${label} keeps its ${kind} answer`);

  return next;
};

const waitForState = (page, expected) =>
  page.waitForFunction(
    (expected) =>
      JSON.stringify(
        document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
      ) === expected,
    JSON.stringify(expected),
  );

const closeMenus = async (page) => {
  for (let i = 0; i < 4 && (await page.getByRole("menu").count()); i++) {
    // Retain this popup: a live .last() locator would switch to its parent as it closes.
    const popup = await page.getByRole("menu").last().elementHandle();

    if (!popup) continue;
    await page.keyboard.press("Escape");
    await popup.waitForElementState("hidden", { timeout: 3000 });
    await popup.dispose();
  }

  assert.equal(await page.getByRole("menu").count(), 0, "field menu closes");
};

const openMenu = async (page, label) => {
  await closeMenus(page);
  await question(page, label).hover();
  await page.getByRole("button", { name: "Move this block by dragging", exact: true }).click();
  await page.getByRole("menu").first().waitFor();
};

const setValue = async (page, title, label, value) => {
  await openMenu(page, title);
  const row = page.getByRole("menuitemcheckbox", { name: label, exact: true });
  assert.equal(await row.count(), 1, `${label} has one owner`);

  if ((await row.getAttribute("aria-checked")) !== "true") await row.click();

  if (!(await page.getByRole("menu").first().isVisible())) await openMenu(page, title);
  // The existing switch's input is immediately after its row and has no separate label.
  await row.locator("xpath=following-sibling::*[1]").locator("input").fill(String(value));
  await closeMenus(page);
};

const submenu = async (page, title, label) => {
  await openMenu(page, title);
  await page.getByRole("menuitem", { name: label }).focus();
  await page.keyboard.press("ArrowRight");
};

const saveSource = async (page, title, marker) => {
  await page.waitForFunction(
    ({ key, title, marker }) => {
      const saved = localStorage.getItem(key);

      return (
        saved?.includes(title) &&
        saved.includes(marker) &&
        !!document.querySelector('[role="status"][title="Saved"]')
      );
    },
    { key: storageKey, title, marker },
  );
  const saved = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  assert.match(saved, /^---\nformat: "govbb-form"\nformatVersion: 2\n/);
  await page.getByRole("button", { name: /^Markdown/ }).click();
  const source = page.getByRole("textbox", { name: "Markdown source", exact: true });
  await source.waitFor();
  assert.equal(
    await source.inputValue(),
    saved,
    "visible canonical source matches the saved draft",
  );
  assert.equal(await page.getByRole("button", { name: /^Line \d+:/ }).count(), 0);
  await page.getByRole("button", { name: "Close source", exact: true }).click();

  return saved;
};

try {
  for (const [kind, entry, title] of [
    ["text", "Text input", "Module reference"],
    ["file-upload", "File upload", "Module evidence"],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    current = page;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await form(page).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[role="status"][title="Saved"]').waitFor();

    const intro = form(page)
      .locator(":scope > *")
      .filter({ hasText: /^Use this form to apply/ })
      .first();

    await intro.hover();
    await page.getByRole("button", { name: "Insert block below", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Insert a block" });
    await dialog.waitFor();
    await page.getByRole("combobox", { name: "Search blocks", exact: true }).fill(entry);
    assert.equal(await dialog.getByRole("option", { name: entry, exact: true }).count(), 1);
    const before = await state(page);
    await dialog.getByRole("option", { name: entry, exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      ({ kind, count }) =>
        document
          .querySelector('[aria-label="Form"]')
          .__lexicalEditor.getEditorState()
          .toJSON()
          .root.children.filter((node) =>
            kind === "text"
              ? node.type === "input" && (node.kind ?? "text") === kind
              : node.type === "widget" && node.widget === kind,
          ).length ===
        count + 1,
      { kind, count: before.root.children.filter((node) => isAnswer(node, kind)).length },
    );
    const inserted = await state(page);
    assert.equal(
      inserted.root.children.filter((node) => node.type === "question").length,
      before.root.children.filter((node) => node.type === "question").length + 1,
    );
    const oldIds = new Set(before.root.children.map((node) => node.$?.id));

    const titleIndex = inserted.root.children.findIndex(
      (node) => node.type === "question" && !oldIds.has(node.$?.id),
    );

    assert.ok(titleIndex >= 0, "insertion creates a new question identity");
    const input = inserted.root.children[titleIndex + 1];
    assert.ok(isAnswer(input, kind));
    assert.equal(settings(input).required, true);

    if (kind === "file-upload")
      assert.deepEqual(settings(input).allowedFiles, [
        "application/pdf",
        "image/jpeg",
        "image/png",
      ]);
    await form(page).locator("[data-page-title] > [data-text]").first().click();
    await page.keyboard.press("Meta+z");
    await waitForState(page, before);
    await page.keyboard.press("Meta+Shift+z");
    await waitForState(page, inserted);
    await form(page).locator(":scope > *").nth(titleIndex).locator("h2").fill(title);

    if (kind === "text") {
      await setValue(page, title, "Default answer", "ABC123");
      await setValue(page, title, "Min characters", 2);
      await setValue(page, title, "Max characters", 20);
      await submenu(page, title, /^Field width/);
      await page.getByRole("menuitemradio", { name: "Short", exact: true }).click();
      await submenu(page, title, /^Format/);
      await page
        .getByRole("textbox", { name: "Validation pattern", exact: true })
        .fill("^[A-Z]{3}[0-9]{3}$");
      await page.getByRole("textbox", { name: "Input mask", exact: true }).fill("AAA999");
      await closeMenus(page);

      const expected = {
        required: true,
        hasDefaultAnswer: true,
        defaultAnswer: "ABC123",
        hasMinCharacters: true,
        minCharacters: 2,
        hasMaxCharacters: true,
        maxCharacters: 20,
        width: "short",
        pattern: "^[A-Z]{3}[0-9]{3}$",
        mask: "AAA999",
      };

      const verify = async () => {
        const actual = settings(answer(await state(page), title, kind));

        for (const [key, value] of Object.entries(expected))
          assert.deepEqual(actual[key], value, `saved text ${key}`);
        const input = question(page, title).locator("xpath=following-sibling::*[1]");
        assert.match(await input.innerText(), /AAA999/, "the canvas renders the edited mask");
        assert.equal(
          await input.evaluate((node) =>
            getComputedStyle(node).getPropertyValue("--field-width").trim(),
          ),
          "24ch",
          "the canvas applies the Short field width",
        );
      };

      await verify();
      const saved = await saveSource(page, title, "AAA999");
      await page.reload();
      await form(page).waitFor();
      await verify();
      assert.equal(
        await saveSource(page, title, "AAA999"),
        saved,
        "text canonical source is stable across reload",
      );
      await submenu(page, title, /^Format/);
      assert.equal(
        await page.getByRole("textbox", { name: "Validation pattern", exact: true }).inputValue(),
        expected.pattern,
      );
      assert.equal(
        await page.getByRole("textbox", { name: "Input mask", exact: true }).inputValue(),
        expected.mask,
      );
    } else {
      await openMenu(page, title);
      assert.equal(
        await page
          .getByRole("menuitemcheckbox", { name: "Hide question label", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.getByRole("menuitemcheckbox", { name: "Default answer", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("menuitemcheckbox", { name: "Multiple files", exact: true }).count(),
        1,
      );
      await page.getByRole("menuitemcheckbox", { name: "Multiple files", exact: true }).click();
      await setValue(page, title, "Min files", 1);
      await setValue(page, title, "Max files", 3);
      await setValue(page, title, "Max file size (MB)", 10);

      for (const name of ["JPEG", "PNG", "Word"]) {
        await submenu(page, title, /^Allowed files/);
        await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
      }

      await closeMenus(page);

      const expected = {
        required: true,
        hasMultipleFiles: true,
        hasMinFiles: true,
        minFiles: 1,
        hasMaxFiles: true,
        maxFiles: 3,
        hasMaxFileSize: true,
        maxFileSize: 10,
        allowedFiles: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      };

      const verify = async () => {
        const actual = settings(answer(await state(page), title, kind));

        for (const [key, value] of Object.entries(expected))
          assert.deepEqual(actual[key], value, `saved upload ${key}`);
        const upload = question(page, title).locator("xpath=following-sibling::*[1]");
        await upload.getByText("Attach a .pdf or .docx file", { exact: true }).waitFor();
        await upload.getByText("Maximum size: 10MB", { exact: true }).waitFor();
      };

      await verify();
      const saved = await saveSource(page, title, "wordprocessingml.document");
      await page.reload();
      await form(page).waitFor();
      await verify();
      assert.equal(
        await saveSource(page, title, "wordprocessingml.document"),
        saved,
        "upload canonical source is stable across reload",
      );
      await submenu(page, title, /^Allowed files/);

      for (const [name, checked] of [
        ["PDF", true],
        ["Word", true],
        ["JPEG", false],
        ["PNG", false],
      ])
        assert.equal(
          await page
            .getByRole("menuitemcheckbox", { name, exact: true })
            .getAttribute("aria-checked"),
          String(checked),
        );
    }

    assert.deepEqual(errors, []);
    console.log(
      `PASS ${entry}: insertion defaults, exact undo/redo, field controls, canonical save and reload; no browser errors`,
    );
    await context.close();
  }
} catch (error) {
  console.error(errors);

  if (current && !current.isClosed()) {
    await current.screenshot({ path: "/tmp/lexical-field-modules-failure.png", fullPage: true });
    console.error((await current.locator("body").innerText()).slice(-5000));
  }

  throw error;
} finally {
  await browser.close();
}
