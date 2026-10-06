// Every surface and state of the editor, for a design review: node review-shots.mjs <outdir> [url]
import { mkdirSync } from "node:fs";
import { chromium } from "./playwright.mjs";

const dir = process.argv[2] ?? "review";

const url = process.argv[3] ?? "http://localhost:3013/";

mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();

const errors = [];

const shots = [];

async function fresh(viewport, scale = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[aria-label="Form"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  return page;
}

const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(200);
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path, ...opts });
  shots.push(path);
};

const block = (page, text) => page.locator('[aria-label="Form"] > *', { hasText: text }).first();

// Puts the caret at the end of a text block (click right of the text on its last line)
const caretAtEnd = async (page, locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width - 3, box.y + box.height - 12);
};

// ---- Desktop
{
  const page = await fresh({ width: 1440, height: 900 });
  await shot(page, "01-desktop-full", { fullPage: true });
  await shot(page, "02-desktop-first-viewport");

  // Hover gutter on a question
  await block(page, "Which parish").hover({ position: { x: 20, y: 30 } });
  await shot(page, "03-gutter-hover");

  // Block menu of the dropdown
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.locator("[role=menu]").waitFor();
  await shot(page, "04-block-menu");
  await page.keyboard.press("Escape");

  // Slash menu on a new line after the intro
  await caretAtEnd(page, block(page, "Use this form"));
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await page.locator("#typeahead-menu [role=option]").first().waitFor();
  await shot(page, "05-slash-menu");
  await page.keyboard.type("date");
  await shot(page, "06-slash-filtered");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");

  // Formatting toolbar: select the intro's words
  const intro = block(page, "Use this form");
  const ib = await intro.boundingBox();
  await page.mouse.move(ib.x + 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(ib.x + 160, ib.y + ib.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await shot(page, "07-format-toolbar");
  await page.keyboard.press("Escape");

  // Insert modal from the gutter's +
  await block(page, "Which roads").hover({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Insert block below" }).click();
  await page.getByRole("combobox", { name: "Search blocks" }).waitFor();
  await shot(page, "08-insert-modal");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await shot(page, "08b-insert-preview-choice");

  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowDown");
  await shot(page, "08c-insert-preview-date");
  await page.getByRole("combobox", { name: "Search blocks" }).fill("conditional");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // The logic block, a calculated fields block, and a picker open
  const logic = page.locator("[data-lexical-decorator]", { hasText: "When" }).first();
  await logic.scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  await shot(page, "09-logic-block");
  await logic.locator("button").first().click();
  await page.waitForTimeout(250);
  await shot(page, "10-logic-picker-open");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Select the current block, then extend the selection twice.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(() => scrollTo(0, 0));
  await block(page, "Event name").locator("h2").click();
  await page.waitForTimeout(150); // Lexical takes the click's selection a frame later
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.mouse.move(5, 5);
  await shot(page, "11-selected-blocks");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Folded question
  await page.locator('button[aria-label="Fold blocks"]').first().click();
  await shot(page, "12-folded-question");

  // Bulk insert dialog, from the folded dropdown's block menu (unfold first)
  await page.locator('button[aria-label="Unfold blocks"]').first().click();
  await block(page, "Which parish").hover({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByRole("menuitem", { name: /Bulk insert options/ }).click();
  await page.waitForTimeout(300);
  await shot(page, "13-bulk-insert");
  await page.keyboard.press("Escape");

  // Date settings: the date question's menu with Before/After limits
  await block(page, "Event date").hover({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.locator("[role=menu]").waitFor();
  await shot(page, "14-date-menu");
  await page.keyboard.press("Escape");

  // A tooltip (the gutter's trash)
  await block(page, "Event name").hover({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Delete this block" }).hover();
  await page.waitForTimeout(500);
  await shot(page, "15-tooltip");

  // The desk between two pages
  await page
    .locator("[data-lexical-decorator]", { hasText: "Road closure" })
    .first()
    .scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  await page.evaluate(() => scrollBy(0, -200));
  await shot(page, "16-page-gap");

  // Keyboard: ⌘/ opens the caret block's menu; Esc goes back to the caret
  await page.evaluate(() => scrollTo(0, 0));
  await caretAtEnd(page, block(page, "Event name").locator("h2"));
  await page.mouse.move(5, 5);
  await page.keyboard.press("Meta+/");
  await page.waitForTimeout(250);
  await shot(page, "17-keyboard-menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  errors.push(
    `focus after Esc: ${await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName)}`,
  );
  // Tab from the text reaches the caret block's actions
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  await shot(page, "18-keyboard-strip");
  await page.close();
}

// ---- Phone
{
  const page = await fresh({ width: 390, height: 844 }, 2);
  await shot(page, "20-phone-full", { fullPage: true });
  await shot(page, "21-phone-first-viewport");
  await caretAtEnd(page, block(page, "Use this form"));
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await page.locator("#typeahead-menu [role=option]").first().waitFor();
  await shot(page, "22-phone-slash");
  await page.close();
}

console.log(shots.join("\n"));

console.log(errors.length ? `ERRORS:\n${errors.slice(0, 10).join("\n")}` : "no errors");

await browser.close();
