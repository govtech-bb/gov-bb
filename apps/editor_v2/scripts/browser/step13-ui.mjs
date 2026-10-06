import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const url = process.argv[2] ?? "http://localhost:3017/";

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const root = page.locator('[contenteditable="true"][aria-label="Form"]');
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Conditional wording now uses the unified-logic browser flow.
  const dateLabel = root.locator("h2").filter({ hasText: "Event date" });
  await dateLabel.hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menuitem", { name: "Add conditional logic" }).click();

  const logic = page
    .locator("[data-logic-block]")
    .filter({ has: page.getByRole("combobox", { name: "Select field", exact: true }) })
    .filter({ has: page.getByRole("combobox", { name: "Select action", exact: true }) })
    .last();

  await logic.getByRole("combobox", { name: "Select field", exact: true }).click();
  await page.getByRole("option", { name: "Event date", exact: true }).click();
  await page.getByRole("combobox", { name: "Compare", exact: true }).click();
  await page.getByRole("option", { name: "Age in years", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Age in years" }).fill("18");
  await page.waitForFunction(() =>
    (
      localStorage.getItem("govbb-editor:draft:markdown:v2") ??
      localStorage.getItem("govbb-editor:draft")
    )?.includes("yearsSince"),
  );
  await page.getByRole("combobox", { name: "Compare", exact: true }).click();
  await page.getByRole("option", { name: "Date input", exact: true }).click();
  assert.equal(await page.getByRole("spinbutton", { name: "Age in years" }).count(), 0);
  await page.getByRole("combobox", { name: "Compare", exact: true }).click();
  await page.getByRole("option", { name: "Age in years", exact: true }).click();
  assert.equal(await page.getByRole("spinbutton", { name: "Age in years" }).inputValue(), "");
  await page.getByRole("spinbutton", { name: "Age in years" }).fill("21");
  await page.waitForFunction(() => {
    const saved =
      localStorage.getItem("govbb-editor:draft:markdown:v2") ??
      localStorage.getItem("govbb-editor:draft");

    const state = document
      .querySelector('[contenteditable="true"][aria-label="Form"]')
      .__lexicalEditor.getEditorState()
      .toJSON();

    return (
      saved &&
      /"value"\s*:\s*21/.test(saved) &&
      state.root.children.some((node) =>
        node.$?.settings?.conditionals?.some(
          (condition) => condition.transform === "yearsSince" && condition.value === 21,
        ),
      )
    );
  });
  await page.reload();
  assert.equal(await page.getByRole("spinbutton", { name: "Age in years" }).inputValue(), "21");
  assert.deepEqual(errors, []);
  console.log("PASS date/age switching, age persistence and no browser errors");
} catch (error) {
  console.log((await page.locator("body").innerText()).slice(-12000));
  await page.screenshot({ path: "/tmp/govbb-editor-date-age-failure.png" });
  throw error;
} finally {
  await browser.close();
}
