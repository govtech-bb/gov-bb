import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const root = page.locator('[contenteditable="true"][aria-label="Form"]');

const settle = () => page.waitForTimeout(140);

const question = (title) =>
  root
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: title }) })
    .first();

const menu = async (title) => {
  await question(title).scrollIntoViewIfNeeded();
  await question(title).hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
};

const close = async () => {
  await page.keyboard.press("Escape");
  await settle();
};

const insert = async (query, title) => {
  const intro = root.locator(":scope > *").filter({ hasText: "Use this form" }).first();
  await intro.click();
  await settle();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type(`/question ${query}`);
  await page.locator("#typeahead-menu [role=option]").first().waitFor();
  await settle();
  await page.keyboard.press("Enter");
  await settle();
  await page.keyboard.type(title);
  await settle();
  await question(title).waitFor();
};

try {
  await page.goto(process.argv[2] ?? "http://localhost:3016/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await insert("address lookup", "Business address");
  await menu("Business address");
  await page.getByRole("menuitemcheckbox", { name: "Disabled", exact: true }).click();
  await close();
  assert.equal(await root.locator("[data-disabled-tag]:visible").count(), 1);
  await question("Business address").locator("h2").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type(" lookup");
  assert.match(await question("Business address").innerText(), /Business address lookup/);
  await insert("opening hours", "Office opening hours");
  assert.equal(await root.getByText("Monday", { exact: true }).count(), 1);
  assert.equal(await root.getByText("Sunday", { exact: true }).count(), 1);
  await insert("checkbox accordion", "Services offered");
  await page
    .getByRole("textbox", { name: "Category 1 label", exact: true })
    .fill("Advice services");
  await page
    .getByRole("textbox", { name: "Category 1 option 1 label", exact: true })
    .fill("Advice");
  await page
    .getByRole("textbox", { name: "Category 1 option 1 value", exact: true })
    .fill("advice-value");
  await page.getByRole("checkbox", { name: "Higher-risk category" }).check();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Category 2 label", exact: true })
    .fill("Training services");
  await page.getByRole("button", { name: "Move category 2 up", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.getByRole("textbox", { name: "Category 1 label", exact: true }).inputValue(),
    "Training services",
  );
  await page.getByRole("button", { name: "Add option to category 1", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Category 1 option 3 label", exact: true })
    .fill("Training");
  await page.getByRole("button", { name: "Move option 3 up in category 1", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Category 1 option 2 label", exact: true })
      .inputValue(),
    "Training",
  );
  await page.getByRole("button", { name: "Remove option 3 from category 1", exact: true }).click();
  await page.getByRole("button", { name: "Remove option 2 from category 1", exact: true }).click();
  assert.match(await root.innerText(), /With one option, people see the category label/);
  await menu("Services offered");
  await page.getByRole("menuitemcheckbox", { name: "Disabled", exact: true }).click();
  await close();
  await page.getByRole("textbox", { name: "Category 1 label", exact: true }).fill("Training");
  await insert("number", "Number increment test");
  await menu("Number increment test");
  await page.getByRole("textbox", { name: "Increment", exact: true }).fill("0.5");
  await close();
  await insert("time", "Time increment test");
  await menu("Time increment test");
  await page.getByRole("combobox", { name: "Time increment preset" }).selectOption("300");
  await page.getByRole("textbox", { name: "Time increment", exact: true }).fill("0.5");
  await page.getByText("Enter a whole number of seconds", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Time increment", exact: true }).fill("90");
  await close();
  await page.waitForFunction(() =>
    (
      localStorage.getItem("govbb-editor:draft:markdown:v2") ??
      localStorage.getItem("govbb-editor:draft")
    )?.includes("90"),
  );

  const draft = await page.evaluate(() =>
    document
      .querySelector('[contenteditable="true"][aria-label="Form"]')
      .__lexicalEditor.getEditorState()
      .toJSON(),
  );

  const nodes = draft.root.children;
  assert.ok(nodes.some((node) => node.kind === "number" && node.$?.settings?.step === 0.5));
  assert.ok(nodes.some((node) => node.kind === "time" && node.$?.settings?.step === 90));
  const accordion = nodes.find((node) => node.widget === "checkbox-accordion");
  assert.ok(accordion);
  assert.equal(accordion.$.settings.groups[1].higherRisk, true);
  assert.equal(accordion.$.settings.groups[1].options[0].optionValue, "advice-value");
  await page.reload();
  await root.waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Category 1 label", exact: true }).inputValue(),
    "Training",
  );
  assert.equal(await root.locator("[data-disabled-tag]:visible").count(), 2);

  const reloaded = await page.evaluate(
    () =>
      document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON().root
        .children,
  );

  assert.ok(reloaded.some((node) => node.kind === "number" && node.$?.settings?.step === 0.5));
  assert.ok(reloaded.some((node) => node.kind === "time" && node.$?.settings?.step === 90));
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByRole("textbox", { name: "Category 3 label", exact: true }).waitFor();
  await page.getByRole("button", { name: "Remove category 3", exact: true }).focus();
  await page.keyboard.press("Enter");
  await settle();
  assert.equal(
    await page.getByRole("textbox", { name: "Category 3 label", exact: true }).count(),
    0,
  );
  await question("Services offered").locator("h2").click();
  await page.keyboard.press("Meta+z");
  await settle();
  assert.equal(
    await page.getByRole("textbox", { name: "Category 3 label", exact: true }).count(),
    1,
  );
  await page.keyboard.press("Meta+Shift+z");
  await settle();
  assert.equal(
    await page.getByRole("textbox", { name: "Category 3 label", exact: true }).count(),
    0,
  );
  await menu("Services offered");
  await page.getByRole("menuitem", { name: /Duplicate/ }).click();
  await settle();
  const titles = root.locator("h2").filter({ hasText: "Services offered" });
  assert.equal(await titles.count(), 2);
  await titles.last().hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menuitem", { name: /^Delete/ }).click();
  await settle();
  assert.equal(await titles.count(), 1);
  await page.keyboard.press("Meta+z");
  await settle();
  assert.equal(await titles.count(), 2);
  await page.keyboard.press("Meta+Shift+z");
  await settle();
  assert.equal(await titles.count(), 1);
  await page.screenshot({
    path: "/tmp/govbb-editor-specialized-field-controls.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS new field kinds, disabled editing, category/option add/move/delete, risk and values, increments, persistence; no browser errors",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/govbb-editor-specialized-field-controls-failure.png" });
  console.error((await root.innerText()).slice(0, 3000));
  throw error;
} finally {
  await browser.close();
}
