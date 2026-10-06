import { authenticatedContext } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = process.argv[2] ?? "http://localhost:3015/";

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const source = page.getByRole("textbox", { name: "Markdown source", exact: true });

const button = (name) => page.getByRole("button", { name, exact: true });

const navigation = page.getByRole("navigation", { name: "Service documents" });

const fixture = (path) =>
  readFile(new URL(`../../tests/fixtures/pages/corpus/${path}`, import.meta.url), "utf8");

const saved = () => page.locator('[role="status"][title="Saved"]:visible').waitFor();

async function downloadSource(label = "Download source") {
  const event = page.waitForEvent("download");
  await button(label).click();

  return readFile(await (await event).path(), "utf8");
}

async function openSource() {
  await page.getByRole("button", { name: /^Markdown/ }).click();
  await source.waitFor();
}

async function addDocument(kind, title, markdown) {
  await button("Add document").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Document type").selectOption(kind);

  if (title) await dialog.getByLabel(/(?:Page title|Form name) \(optional\)/).fill(title);

  if (markdown !== undefined)
    await dialog.getByLabel("Import page Markdown").setInputFiles({
      name: "page.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(markdown),
    });
  await dialog.getByRole("button", { name: "Add document", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function checkDocumentFileReads() {
  const dialog = page.getByRole("dialog", { name: "Add a document", exact: true });
  const submit = dialog.getByRole("button", { name: "Add document", exact: true });

  const upload = (name, contents) =>
    dialog.getByLabel("Import page Markdown").setInputFiles({
      name,
      mimeType: "text/markdown",
      buffer: Buffer.from(contents),
    });

  const finish = (name, fail = false) =>
    page.evaluate(
      async ({ name, fail }) => {
        const index = window.documentFileReads.findIndex((read) => read.name === name);
        const [read] = window.documentFileReads.splice(index, 1);
        await read.finish(fail);
      },
      { name, fail },
    );

  await button("Add document").click();
  await dialog.getByLabel("Document type").selectOption("supporting");
  await upload("old-file.md", "Old file contents\n");
  await dialog.getByText("Review old-file.md", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.documentFileReads = [];
    window.documentOriginalFileText = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve, reject) => {
        window.documentFileReads.push({
          name: this.name,
          finish: async (fail) => {
            if (fail) reject(new Error("File read failed"));
            else resolve(await window.documentOriginalFileText.call(this));
          },
        });
      });
    };
  });

  try {
    await upload("retry.md", "Retried file contents\n");
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await dialog.locator("details").count(), 0);
    await finish("retry.md", true);
    await dialog.getByRole("alert").filter({ hasText: "could not be read" }).waitFor();
    assert.equal(await submit.isDisabled(), true);
    await dialog.locator("form").evaluate((form) => form.requestSubmit());
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.locator("details").count(), 0);
    await upload("retry.md", "Retried file contents\n");
    await finish("retry.md");
    await dialog.getByText("Review retry.md", { exact: true }).waitFor();
    assert.equal(await submit.isEnabled(), true);
    await dialog.getByLabel("Page title (optional)").fill("Retried file");
    await submit.click();
    await dialog.waitFor({ state: "hidden" });
    await openSource();
    assert.equal(await source.inputValue(), "Retried file contents\n");
    await button("Close source").click();

    await button("Add document").click();
    await upload("earlier.md", "Earlier file contents\n");
    await upload("latest.md", "Latest file contents\n");
    await finish("latest.md");
    await dialog.getByText("Review latest.md", { exact: true }).waitFor();
    await finish("earlier.md");
    assert.equal(await dialog.locator("pre").textContent(), "Latest file contents\n");
    assert.equal(await submit.isEnabled(), true);
    await upload("stale-error.md", "An obsolete failed upload\n");
    await upload("newest.md", "Newest file contents\n");
    await finish("newest.md");
    await dialog.getByText("Review newest.md", { exact: true }).waitFor();
    await finish("stale-error.md", true);
    assert.equal(await dialog.getByRole("alert").count(), 0);
    assert.equal(await dialog.locator("pre").textContent(), "Newest file contents\n");
    assert.equal(await submit.isEnabled(), true);

    await upload("type-change.md", "Ignore this after changing type\n");
    await dialog.getByLabel("Document type").selectOption("application");
    assert.equal(await submit.isEnabled(), true);
    await finish("type-change.md");
    assert.equal(await dialog.locator("details").count(), 0);
    assert.equal(await dialog.getByLabel("Import form JSON").count(), 1);
    await dialog.getByLabel("Document type").selectOption("supporting");
    await upload("failed-first.md", "Do not create a blank document\n");
    await finish("failed-first.md", true);
    await dialog.getByRole("alert").waitFor();
    assert.equal(await submit.isDisabled(), true);
    await dialog.getByLabel("Document type").selectOption("calculator");
    assert.equal(await submit.isEnabled(), true);
    assert.equal(await dialog.getByRole("alert").count(), 0);

    await dialog.getByLabel("Document type").selectOption("supporting");
    await upload("closed-dialog.md", "Ignore a closed dialog\n");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await button("Add document").click();
    await finish("closed-dialog.md");
    assert.equal(await dialog.getByLabel("Page title (optional)").inputValue(), "");
    assert.equal(await dialog.locator("details").count(), 0);
    assert.equal(await submit.isEnabled(), true);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  } finally {
    await page.evaluate(() => {
      File.prototype.text = window.documentOriginalFileText;
    });
  }
}

async function checkMissingExternalDraft() {
  const original = "---\ntitle: Removed record recovery\n---\n\nKeep this page content.\n";
  await addDocument("supporting", "Removed record recovery", original);
  await saved();

  const keys = await page.evaluate(() => {
    const documentId = decodeURIComponent(location.pathname.split("/").at(-1));

    return JSON.parse(localStorage.getItem("govbb-editor:workspace:v1"))
      .services.flatMap((service) => service.documents)
      .find((document) => document.id === documentId).keys;
  });

  const other = await context.newPage();
  await other.goto(new URL("/#/services", url).href);

  try {
    await other.evaluate((key) => localStorage.removeItem(key), keys.committed);
    await source.waitFor();
    await button("Load other tab’s version").click();
    await page.getByRole("alert").filter({ hasText: "saved version was removed" }).waitFor();
    assert.equal(await source.inputValue(), original);
    assert.equal(await downloadSource(), original);
    assert.equal(await other.evaluate((key) => localStorage.getItem(key), keys.committed), null);
    await button("Keep my version").click();
    await saved();
    await page.reload();
    await openSource();
    assert.equal(await source.inputValue(), original);
    assert.equal(await downloadSource(), original);

    const local = original + "\nUnapplied local changes.\n";
    const remote = original + "\nUnapplied remote changes.\n";
    await source.fill(local);
    await other.evaluate(
      ({ keys, remote }) => {
        localStorage.setItem(keys.working, remote);
        localStorage.removeItem(keys.committed);
      },
      { keys, remote },
    );
    await button("Load other tab’s version").waitFor();
    await button("Load other tab’s version").click();
    await page.getByRole("alert").filter({ hasText: "saved version was removed" }).waitFor();
    assert.equal(await source.inputValue(), local);
    assert.equal(await downloadSource(), local);
    assert.equal(await downloadSource("Download other version"), remote);
    assert.equal(await other.evaluate((key) => localStorage.getItem(key), keys.working), remote);
    assert.equal(await other.evaluate((key) => localStorage.getItem(key), keys.committed), null);
    await button("Keep my version").click();
    await button("Apply changes").click();
    await saved();
    await page.reload();
    await openSource();
    assert.equal(await source.inputValue(), local);
    assert.equal(await downloadSource(), local);
    await button("Close source").click();
  } finally {
    await other.close();
  }
}

try {
  await page.goto(url);
  await page.getByRole("textbox", { name: "Form", exact: true }).waitFor();
  await saved();
  const originalRoute = page.url();

  const originalDrafts = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes("workspace"))),
  );

  await button("Create service").click();
  await page.getByLabel("Service name", { exact: true }).fill("Birth certificates");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create service", exact: true })
    .click();
  await body.waitFor();
  assert.equal(await page.getByRole("button", { name: "JSON", exact: true }).count(), 0);
  await button("Add content").click();
  const insertList = page.getByRole("listbox", { name: "Insert page content" });
  assert.equal(
    await insertList
      .getByRole("option")
      .filter({ hasText: /question/i })
      .count(),
    0,
  );
  await page.keyboard.press("Escape");
  await body.fill("Find out how to get a certificate.");
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("Get a birth certificate");
  await saved();
  await openSource();
  assert.match(await source.inputValue(), /title:.*Get a birth certificate/);
  assert.match(await source.inputValue(), /Find out how to get a certificate/);
  const beforeUpload = await source.inputValue();
  await page.evaluate(() => {
    window.pendingFileReads = [];
    window.originalFileText = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve) =>
        window.pendingFileReads.push(() => window.originalFileText.call(this).then(resolve)),
      );
    };
  });
  await page.getByLabel("Open Markdown file", { exact: true }).setInputFiles({
    name: "slow.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Older file content"),
  });
  await source.fill(beforeUpload + "\nKeep my newer typing.\n");
  await page.evaluate(() => {
    window.pendingFileReads.shift()();
    File.prototype.text = window.originalFileText;
  });
  await page.getByText(/Your changes were kept/).waitFor();
  assert.equal(await source.inputValue(), beforeUpload + "\nKeep my newer typing.\n");
  await button("Discard changes").click();
  const birth = await fixture("get-birth-certificate/index.md");
  await source.fill(birth);
  await button("Apply changes").click();
  assert.equal(await downloadSource(), birth);
  await button("Close source").click();
  await body.locator("ol").waitFor();
  assert.ok(await body.locator("ol li h4").count());
  assert.ok(await body.locator('[data-page-component="start"]').count());
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("Get your birth certificate");
  await saved();
  await button("Preview page").click();
  await page
    .getByRole("article", { name: "Page preview" })
    .getByRole("heading", { name: "Get your birth certificate", exact: true })
    .waitFor();
  const previewRoute = page.url();
  const previewLink = page.getByRole("article", { name: "Page preview" }).getByRole("link").first();
  await previewLink.click();
  assert.equal(page.url(), previewRoute);
  await previewLink.focus();
  await page.keyboard.press("Enter");
  assert.equal(page.url(), previewRoute);
  await button("Back to editing").click();
  const entryRoute = page.url();

  await checkDocumentFileReads();
  await navigation.getByRole("link", { name: "Entry page", exact: true }).click();
  await addDocument("supporting", "Fees", await fixture("calculate-your-pension/index.md"));
  await body.locator("table").first().waitFor();
  await page.getByRole("textbox", { name: "Page title", exact: true }).fill("Fees");
  const table = body.locator("table").first();
  const rows = await table.locator("tr").count();
  await table.locator("td,th").first().click();
  await button("Block options").click();
  await button("Add row").click();
  assert.equal(await table.locator("tr").count(), rows + 1);
  const columns = await table.locator("tr").first().locator("td,th").count();
  await button("Block options").click();
  await button("Add column").click();
  assert.equal(await table.locator("tr").first().locator("td,th").count(), columns + 1);
  await saved();
  const tableRoute = page.url();
  await navigation.getByRole("link", { name: "Entry page", exact: true }).click();
  const beforeHiddenUndo = await page.evaluate(() => JSON.stringify(localStorage));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), beforeHiddenUndo);
  assert.equal(
    await page.getByRole("textbox", { name: "Page title", exact: true }).inputValue(),
    "Get your birth certificate",
  );
  await button("Undo").click();
  assert.equal(
    await page.getByRole("textbox", { name: "Page title", exact: true }).inputValue(),
    "Get a copy of a birth certificate",
  );
  await navigation.getByRole("link", { name: "Fees", exact: true }).click();
  assert.equal(await table.locator("tr").first().locator("td,th").count(), columns + 1);
  await button("Undo").click();
  assert.equal(await table.locator("tr").first().locator("td,th").count(), columns);
  assert.equal(await table.locator("tr").count(), rows + 1);
  await button("Add document").click();
  await page
    .getByRole("dialog")
    .getByLabel("Page title (optional)")
    .fill("Do not move this staged page");
  await page.goBack();
  assert.equal(page.url(), entryRoute);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goForward();
  assert.equal(page.url(), tableRoute);
  await openSource();
  const tableSource = await source.inputValue();
  await source.fill(tableSource + "\nUnapplied supporting page note\n");
  await button("Close source").click();
  await navigation.getByRole("link", { name: "Entry page", exact: true }).click();
  await navigation.getByRole("link", { name: "Fees", exact: true }).click();
  await page.reload();
  await openSource();
  assert.equal(await source.inputValue(), tableSource + "\nUnapplied supporting page note\n");
  await button("Discard changes").click();
  await button("Close source").click();

  await addDocument("calculator", "Certificate fee calculator");
  await page.getByRole("textbox", { name: "Form", exact: true }).waitFor();
  await button("JSON").click();
  const jsonDownload = page.waitForEvent("download");
  await button("Download JSON").click();
  const form = JSON.parse(await readFile(await (await jsonDownload).path(), "utf8"));
  assert.equal(form.mode, "calculator");
  await page.getByLabel("Open form JSON file", { exact: true }).setInputFiles({
    name: "application.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...form, mode: "application" })),
  });
  await page.getByText("Ready to review and apply", { exact: true }).waitFor();
  await button("Close form JSON").click();
  assert.equal(await navigation.getByRole("link", { name: "Calculator", exact: true }).count(), 1);
  await button("JSON").click();
  await button("Apply import").click();
  await button("Close form JSON").click();
  await navigation.getByRole("link", { name: "Application form", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Form", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await navigation.getByRole("link", { name: "Calculator", exact: true }).waitFor();
  await navigation.getByRole("link", { name: "Entry page", exact: true }).click();
  assert.equal(await button("Page settings").count(), 0);
  await openSource();
  const currentPageSource = await source.inputValue();
  await source.fill(currentPageSource.replace(/^form_id:.*$/m, `form_id: ${form.id}`));
  await button("Apply changes").click();
  assert.match(await source.inputValue(), new RegExp(`form_id: ${form.id}`));
  await button("Close source").click();

  const raw = await fixture("calculate-your-pension/about-government-pensions.md");
  await addDocument("supporting", "Pension guidance", raw);
  await page.getByRole("heading", { name: "Edit this page in Markdown", exact: true }).waitFor();
  assert.equal(await source.inputValue(), raw);
  assert.equal(await downloadSource(), raw);
  await source.fill(raw + "\nA new guidance paragraph.\n");
  await button("Apply changes").click();
  await saved();
  await page.reload();
  assert.equal(await source.inputValue(), raw + "\nA new guidance paragraph.\n");
  const invalid = "---\ntitle: [unclosed\n---\n\nKeep this draft.";
  await source.fill(invalid);
  await button("Apply changes").click();
  assert.equal(await source.getAttribute("aria-invalid"), "true");
  await page.reload();
  assert.equal(await source.inputValue(), invalid);
  await button("Discard changes").click();
  await source.fill("---\ntitle: Simple guidance\n---\n\nWrite here.\n");
  await button("Apply changes").click();
  await body.waitFor();
  await body.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/notice");
  await page
    .getByRole("listbox", { name: "Insert page content" })
    .getByRole("option", { name: "Notice", exact: true })
    .click();
  await body.locator('[data-page-component="notice"]').waitFor();
  await button("Block options").click();
  await button("Add text after block").click();
  await button("Add content").click();
  await page.getByRole("combobox", { name: "Search page content" }).fill("Table");
  await page
    .getByRole("listbox", { name: "Insert page content" })
    .getByRole("option", { name: "Table", exact: true })
    .click();
  await body.locator("table").waitFor();
  await saved();
  await page.screenshot({ path: "/tmp/service-workspace-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: "/tmp/service-workspace-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await checkMissingExternalDraft();

  await page.goto(originalRoute);
  await page.getByRole("textbox", { name: "Form", exact: true }).waitFor();

  const remainingDrafts = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );

  for (const [key, value] of Object.entries(originalDrafts))
    assert.equal(remainingDrafts[key], value);
  assert.deepEqual(errors, []);
  console.log(
    "PASS service workspace: page/form isolation, file-read races/retry, missing-record recovery, corpus import, tables, metadata, undo, source-only recovery, reload, preview and mobile",
  );
} finally {
  await browser.close();
}
