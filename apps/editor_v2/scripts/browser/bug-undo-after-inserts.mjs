import { authenticatedContext } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const url = process.argv[2] ?? "http://localhost:3013/";

const browser = await chromium.launch();

try {
  for (const [modifier, gap] of [
    ["Meta", 80],
    ["Control", 950],
  ]) {
    const context = await authenticatedContext(browser, {
      viewport: { width: 1440, height: 900 },
      userAgent:
        modifier === "Meta"
          ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const root = page.locator('[contenteditable="true"][aria-label="Form"]');
    await root.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    // Inputs belong on question pages; the demo ends on a restricted confirmation page.
    const confirmation = page.getByRole("switch", { name: "Confirmation page" }).last();
    assert.equal(await confirmation.getAttribute("aria-checked"), "true");
    await confirmation.click();
    await page.waitForTimeout(100);
    assert.equal(await confirmation.getAttribute("aria-checked"), "false");
    await page.locator('[role="status"][title="Saved"]').waitFor();
    // Reload the saved question page so setup cannot become part of the undo sequence.
    await page.reload();
    await root.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);

    const state = () =>
      page.evaluate(() =>
        document.querySelector('[aria-label="Form"]').__lexicalEditor.getEditorState().toJSON(),
      );

    const baseline = await state();
    const lastBlock = () => root.locator(":scope > *").last();

    const endOfLastBlock = async () => {
      await lastBlock().click({ position: { x: 8, y: 8 } });
      await lastBlock().evaluate((block) => {
        const slot = block.querySelector("[data-text]") ?? block;
        const range = document.createRange();
        range.selectNodeContents(slot);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        block.closest('[contenteditable="true"]').focus();
      });
    };

    await endOfLastBlock();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    for (const [query, type, kind] of [
      ["time", "input", "time"],
      ["heading 2", "heading", "h2"],
      ["new page", "widget", "page-break"],
    ]) {
      const before = (await state()).root.children.filter(
        (n) =>
          n.type === type &&
          (n.kind ?? n.widget ?? n.tag ?? (n.type === "widget" ? "page-break" : "")) === kind,
      ).length;

      await endOfLastBlock();
      await page.keyboard.press("Enter");
      await page.keyboard.type(`/${query}`);
      const option = page.locator("#typeahead-menu [role=option]").first();
      await option.waitFor({ timeout: 5000 }).catch(async (error) => {
        console.error(query, JSON.stringify((await state()).root.children.slice(-5)));
        throw error;
      });
      await page.waitForTimeout(100);
      assert.match(
        await option.innerText(),
        query === "time" ? /Time/i : query === "heading 2" ? /Heading 2/i : /New page/i,
      );
      await page.keyboard.press("Enter");
      await page.waitForTimeout(gap);

      const after = (await state()).root.children.filter(
        (n) =>
          n.type === type &&
          (n.kind ?? n.widget ?? n.tag ?? (n.type === "widget" ? "page-break" : "")) === kind,
      ).length;

      if (after !== before + 1)
        console.error(JSON.stringify((await state()).root.children.slice(-4)));
      assert.equal(after, before + 1, `${query} must really be inserted`);
    }

    const inserted = await state();
    let undoCount = 0;
    let current = inserted;

    while (JSON.stringify(current) !== JSON.stringify(baseline) && undoCount < 40) {
      await page.keyboard.press(`${modifier}+z`);
      await page.waitForTimeout(40);
      const next = await state();
      assert.notDeepEqual(next, current, "undo must change the document until its starting state");
      current = next;
      undoCount++;
    }

    assert.deepEqual(current, baseline, "undo must restore the exact nonempty starting document");

    for (let i = 0; i < undoCount; i++) {
      await page.keyboard.press(modifier === "Meta" ? "Meta+Shift+z" : "Control+y");
      await page.waitForTimeout(40);
    }

    assert.deepEqual(
      await state(),
      inserted,
      "redo must restore inserted nodes including complete page heads",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${modifier}+Z, ${gap}ms gaps: ${undoCount} undo/redo steps restore exact documents`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
