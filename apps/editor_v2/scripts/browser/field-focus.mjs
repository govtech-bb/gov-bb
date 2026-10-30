import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "govbb-field-focus-"));

const bundle = join(directory, "field-focus.js");

const screenshots = process.env.FIELD_FOCUS_SCREENSHOTS;

let browser;

try {
  await buildBrowserFixture("tests/browser/field-focus.tsx", bundle);
  const css = await readFile(join(directory, "fixture.css"), "utf8");

  if (screenshots) await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch();
  const errors = [];
  const results = [];

  for (const forcedColors of ["none", "active"]) {
    const page = await browser.newPage({ forcedColors, viewport: { width: 800, height: 600 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.abort());
    await page.setContent(
      '<!doctype html><html><head></head><body><main id="app"></main></body></html>',
    );
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ path: bundle });
    await page.getByLabel("Visibility", { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
      forcedColors === "active",
    );

    for (const label of ["Visibility", "Description", "Form ID"]) {
      const control = page.getByLabel(label, { exact: true });
      assert.equal(
        await control.evaluate((element) => getComputedStyle(element).outlineStyle),
        "none",
        `${label} has no focus outline at rest (${forcedColors})`,
      );
      await page.keyboard.press("Tab");

      const style = await control.evaluate((element) => {
        const computed = getComputedStyle(element);

        return {
          focused: document.activeElement === element,
          focusVisible: element.matches(":focus-visible"),
          outlineStyle: computed.outlineStyle,
          outlineWidth: computed.outlineWidth,
          outlineColor: computed.outlineColor,
          outlineOffset: computed.outlineOffset,
          backgroundColor: computed.backgroundColor,
          boxShadow: computed.boxShadow,
          forcedColorAdjust: computed.forcedColorAdjust,
        };
      });

      results.push({ forcedColors, label, ...style });
      console.log(JSON.stringify(results.at(-1)));

      if (screenshots)
        await page.screenshot({
          path: join(screenshots, `${forcedColors}-${label.replaceAll(" ", "-")}.png`),
        });
    }

    await page.close();
  }

  assert.deepEqual(errors, []);

  for (const style of results) {
    const name = `${style.label} (${style.forcedColors})`;

    assert.equal(style.focused, true, `${name} receives Tab focus`);
    assert.equal(style.focusVisible, true, `${name} matches :focus-visible`);

    if (style.forcedColors === "active") {
      assert.equal(style.boxShadow, "none", `${name} cannot rely on its shadow`);
      assert.equal(style.outlineStyle, "solid", `${name} has a visible focus outline`);
      assert.ok(parseFloat(style.outlineWidth) >= 2, `${name} has a 2px or thicker outline`);
      assert.equal(style.outlineOffset, "2px", `${name} separates focus from the field`);
      assert.notEqual(style.outlineColor, "rgba(0, 0, 0, 0)", `${name} is not transparent`);
      assert.notEqual(style.outlineColor, style.backgroundColor, `${name} is not the background`);
      assert.equal(style.forcedColorAdjust, "auto", `${name} respects the user's palette`);
    } else {
      assert.equal(style.outlineStyle, "none", `${name} keeps the shadow-only normal focus`);
      assert.equal(
        style.boxShadow,
        "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(0, 0, 0) 0px 0px 0px 2px inset, rgb(48, 192, 200) 0px 0px 0px 3px",
        `${name} keeps the normal 2px ink edge and 3px teal halo`,
      );
    }
  }

  console.log(
    "PASS field focus: Input, Textarea and NativeSelect with Tab in normal and forced colours",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
