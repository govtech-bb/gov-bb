import { chromium } from "./playwright.mjs";

const url = process.argv[2] ?? "http://localhost:3016/";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(url);

await page.evaluate(() => localStorage.clear());

await page.reload();

await page.locator('[aria-label="Form"]').waitFor();

const ok = (name, pass, detail = "") => console.log(`${pass ? "PASS" : "FAIL"} ${name} ${detail}`);

const text = () => page.locator('[aria-label="Form"]').innerText();

const before = await text();

// Click an input box (block selected), type
await page.locator("[data-drawn]:not([hidden])").first().click();

await page.waitForTimeout(150);

await page.keyboard.type("xyz q");

await page.waitForTimeout(150);

ok("typing with a clicked box selected changes nothing", (await text()) === before);

// Typing replaces the selected block.
await page.keyboard.press("Escape");

await page.locator('[aria-label="Form"] > *', { hasText: "Use this form" }).first().click();

await page.waitForTimeout(150);

await page.keyboard.press("Escape");

await page.waitForTimeout(100);

await page.keyboard.type("abc");

await page.waitForTimeout(150);

ok("typing with an Esc-selected block changes nothing", (await text()) === before);

await browser.close();
