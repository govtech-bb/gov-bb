import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto("http://localhost:3016/");

await page.evaluate(() => localStorage.clear());

await page.reload();

await page.locator('[aria-label="Form"]').waitFor();

const ok = (name, pass, detail = "") => console.log(`${pass ? "PASS" : "FAIL"} ${name} ${detail}`);

const types = () =>
  page.evaluate(() => {
    const ed = document.querySelector('[aria-label="Form"]').__lexicalEditor;

    return ed
      .getEditorState()
      .toJSON()
      .root.children.map((c) => c.type + (c.children?.[0]?.text ? `:${c.children[0].text}` : ""));
  });

// The caret at the start of the next question's title, right below the Event name input
const title = page
  .locator('[aria-label="Form"] > *', { hasText: "Which parish" })
  .first()
  .locator("h2");

const tb = await title.boundingBox();

await page.mouse.click(tb.x + 2, tb.y + tb.height / 2);

await page.waitForTimeout(150);

const t0 = await types();

const i = t0.findIndex((t) => t.startsWith("question:Which parish"));

ok(
  "the next title sits right under the input",
  i > 0 && t0[i - 1] === "input",
  JSON.stringify(t0.slice(i - 2, i + 1)),
);

await page.keyboard.press("Home");

await page.keyboard.press("Backspace");

await page.waitForTimeout(150);

const t1 = await types();

const sel = await page.evaluate(
  () => [...document.querySelectorAll('[aria-label="Form"] > [data-selected]')].length,
);

ok(
  "first Backspace keeps the input and selects it",
  t1.length === t0.length && sel === 1,
  `blocks ${t0.length}→${t1.length}, selected=${sel}`,
);

await page.keyboard.press("Backspace");

await page.waitForTimeout(150);

const t2 = await types();

ok(
  "second Backspace deletes it, text kept",
  t2.length === t0.length - 1 && t2.some((t) => t.startsWith("question:Which parish")),
  `blocks ${t1.length}→${t2.length}`,
);

await browser.close();
