import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(process.argv[2] ?? "http://localhost:3014/");

await page.evaluate(() => localStorage.clear());

await page.reload();

const root = page.locator('[contenteditable="true"][aria-label="Form"]');

await root.waitFor();

const r = await root.boundingBox();

const a = await root.locator(":scope > *").nth(1).boundingBox();

const b = await root.locator(":scope > *").nth(4).boundingBox();

await page.mouse.move(r.x + r.width - 30, a.y + 2);

await page.mouse.down();

await page.mouse.move(r.x + r.width - 300, b.y + 5, { steps: 10 });

await page.mouse.up();

await page.waitForTimeout(150);

console.log("selected:", await page.locator("[aria-label=Form] > [data-selected]").count());

await browser.close();
