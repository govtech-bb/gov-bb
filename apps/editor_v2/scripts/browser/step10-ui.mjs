import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(process.argv[2] ?? "http://localhost:3014/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const root = page.locator('[contenteditable="true"][aria-label="Form"]');
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const titles = root.locator(":scope > [data-page-title] > [data-text]");
  assert.deepEqual(await titles.allTextContents(), [
    "Tell us about the event",
    "Road closure",
    "Sound systems",
    "Application sent",
  ]);
  assert.equal(
    await root
      .locator(":scope > *")
      .first()
      .evaluate((el) => el.tagName),
    "P",
  );
  assert.equal(
    await root.locator(":scope > [data-page-description] > [data-text]").first().textContent(),
    "We use this to check that amplified music is allowed where and when you plan it.",
  );
  await page.screenshot({ path: "/tmp/govbb-editor-page-headings-desktop.png", fullPage: true });

  await titles.nth(1).fill("Tell us about the road closure");
  await page.waitForTimeout(100); // Let Lexical commit the filled title before moving its caret.
  await titles.nth(1).click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Explain which roads are affected.");
  const roadDescription = root.locator(":scope > [data-page-description] > [data-text]").nth(1);
  assert.equal(await roadDescription.textContent(), "Explain which roads are affected.");
  await titles.last().fill("Application received");
  assert.equal(await titles.last().textContent(), "Application received");

  const question = root
    .locator(":scope > *")
    .filter({ has: page.locator("h2", { hasText: "Do you need to close a road?" }) })
    .first();

  await question.hover();
  await page.getByRole("button", { name: "Move this block by dragging" }).click();
  await page.getByText("Hide question label", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[aria-label="Form"] > [data-label-hidden]')].some((el) =>
      el.textContent.includes("Do you need to close a road?"),
    ),
  );
  assert.equal(
    await question.locator("h2").evaluate((el) => getComputedStyle(el).fontSize),
    "14px",
  );
  console.log("PASS service name, editable page heads, description insertion and hidden labels");

  await page.waitForFunction(() =>
    (
      localStorage.getItem("govbb-editor:draft:markdown:v2") ??
      localStorage.getItem("govbb-editor:draft")
    )?.includes("Explain which roads are affected."),
  );
  await page.reload();
  await titles.first().waitFor();
  assert.equal(await titles.nth(1).textContent(), "Tell us about the road closure");
  assert.equal(await roadDescription.textContent(), "Explain which roads are affected.");
  assert.equal(await titles.last().textContent(), "Application received");
  assert.equal(await root.locator(":scope > [data-label-hidden]").count(), 1);
  console.log("PASS page headings, descriptions and hidden labels survive reload");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/govbb-editor-page-headings-mobile.png" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("PASS mobile has no horizontal overflow; no browser errors");
} catch (error) {
  console.error(
    "Page heads at failure:",
    await page
      .locator("[data-page-title] > [data-text], [data-page-description] > [data-text]")
      .allTextContents(),
  );
  await page.screenshot({ path: "/tmp/govbb-editor-page-headings-failure.png" });
  throw error;
} finally {
  await browser.close();
}
