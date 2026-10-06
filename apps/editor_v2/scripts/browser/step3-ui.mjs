import { chromium } from "./playwright.mjs";

const url = process.argv[2] ?? "http://localhost:3017/";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];

page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));

await page.goto(url);

await page.evaluate(() => localStorage.clear());

await page.reload();

await page.locator('[aria-label="Form"]').waitFor();

await page.evaluate(() => document.fonts.ready);

await page.waitForTimeout(300);

const ok = (name, pass, detail = "") => console.log(`${pass ? "PASS" : "FAIL"} ${name} ${detail}`);

const nid = page.locator('[aria-label="Form"] > *', { hasText: "999999-9999" }).first();

ok("National ID shows its mask note", await nid.isVisible());

const nb = await page
  .locator("[data-drawn]:not([hidden])", { hasText: "999999-9999" })
  .first()
  .boundingBox();

ok(
  "National ID box is medium width (~38ch)",
  nb && nb.width > 300 && nb.width < 520,
  nb && String(Math.round(nb.width)),
);

await page.screenshot({ path: "s3-page1.png", clip: { x: 240, y: 380, width: 960, height: 520 } });

// Date menu: Past or future row
await page.mouse.move(5, 5);

await page
  .locator('[aria-label="Form"] > *', { hasText: "Event date" })
  .first()
  .hover({ position: { x: 20, y: 10 } });

await page.getByRole("button", { name: "Move this block by dragging" }).click();

const menu = page.locator("[role=menu]").first();

await menu.waitFor();

const text = await menu.innerText();

ok(
  "date menu has Past or future + ages",
  /Past or future/.test(text) && /Min age/.test(text),
  JSON.stringify(text.split("\n").slice(0, 14)),
);

await page.keyboard.press("Escape");

// GovBB fields in the slash menu
const intro = page.locator('[aria-label="Form"] > *', { hasText: "Use this form" }).first();

const ib = await intro.boundingBox();

await page.mouse.click(ib.x + ib.width - 3, ib.y + ib.height - 12);

await page.keyboard.press("Enter");

await page.keyboard.type("/parish");

await page.waitForTimeout(300);

const opts = await page.locator("#typeahead-menu [role=option]").allInnerTexts();

ok(
  "GovBB Parish in /",
  opts.some((o) => /Parish/.test(o)),
  JSON.stringify(opts.slice(0, 4)),
);

ok("no errors", errors.length === 0, errors.join(" | "));

await browser.close();
