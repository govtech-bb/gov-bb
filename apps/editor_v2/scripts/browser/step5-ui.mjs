import { chromium } from "./playwright.mjs";

const url = process.argv[2] ?? "http://localhost:3015/";

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

const ok = (name, pass, detail = "") => console.log(`${pass ? "PASS" : "FAIL"} ${name} ${detail}`);

const gap = page.locator("[data-lexical-decorator]", { hasText: "Sound systems" }).first();

await gap.scrollIntoViewIfNeeded();

await page.waitForTimeout(300);

ok(
  "repeat note in the gap",
  /Repeats/.test(await gap.innerText()),
  JSON.stringify((await gap.innerText()).slice(0, 80)),
);

ok(
  "SSB's add-another question drawn",
  await page.getByText("Do you need to add another sound system?").first().isVisible(),
);

ok(
  "repeated answer drawn",
  (await page.getByText("Speaker brand 1").first().isVisible()) &&
    (await page.getByText("Add another speaker brand").first().isVisible()),
);

const g = await gap.boundingBox();

await page.screenshot({
  path: "s5-sound.png",
  clip: { x: 240, y: Math.max(0, g.y - 40), width: 960, height: 860 },
});

// Block menu: Answer more than once on a short answer
await page.mouse.move(5, 5);

await page
  .locator('[aria-label="Form"] > *', { hasText: "Event name" })
  .first()
  .hover({ position: { x: 20, y: 10 } });

await page.getByRole("button", { name: "Move this block by dragging" }).click();

const menu = page.locator("[role=menu]").first();

await menu.waitFor();

ok("Answer more than once in the menu", /Answer more than once/.test(await menu.innerText()));

await page.keyboard.press("Escape");

ok("no errors", errors.length === 0, errors.join(" | "));

await browser.close();
