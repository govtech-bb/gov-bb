import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const url = process.argv[2];

assert.ok(url && /^https?:\/\//.test(url), "Pass an explicit server URL");

const source =
  "---\nformat: govbb-form\nformatVersion: 2\ntitle: Menu ownership\n---\n\n# Your details\n\n::page{#details}\n\n::number[Number field]{#number-field required}\n\n1. Bring evidence\n";

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    (source) => localStorage.setItem("govbb-editor:draft:markdown:v2", source),
    source,
  );
  await page.goto(url);
  const form = page.locator('[contenteditable="true"][aria-label="Form"]');
  await form.waitFor();

  const openMenu = async (block) => {
    await block.hover();
    await page.getByRole("button", { name: "Move this block by dragging", exact: true }).click();
    await page.getByRole("menu").first().waitFor();
  };

  await openMenu(
    form
      .locator(":scope > *")
      .filter({ has: page.locator("h2", { hasText: "Number field" }) })
      .first(),
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Increment", exact: true }).count(),
    1,
    "Number input owns Increment controls",
  );
  assert.equal(
    await page.getByRole("menuitemcheckbox", { name: "Required", exact: true }).count(),
    1,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("menu").first().waitFor({ state: "hidden" });
  await openMenu(form.locator('[data-list="number"]').first());
  assert.equal(
    await page.getByRole("textbox", { name: "Increment", exact: true }).count(),
    0,
    "Numbered list has no Number field controls",
  );
  assert.equal(
    await page.getByRole("menuitemcheckbox", { name: "Required", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("menuitem", { name: /^Turn into/ }).count(),
    1,
    "Numbered list keeps its content actions",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Number input owns Increment; numbered list keeps content controls without field settings; no browser errors",
  );
} finally {
  await browser.close();
}
