import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "govbb-page-preview-"));

const bundle = join(directory, "preview.js");

let browser;

function luminance(color) {
  const rgb = color.match(/[\d.]+/g)?.map(Number);
  assert.equal(rgb?.length, 3, `Expected an opaque RGB color: ${color}`);

  const linear = rgb.map((channel) => {
    const value = channel / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

try {
  await buildBrowserFixture("tests/browser/page-preview.tsx", bundle);
  const css = await readFile(join(directory, "fixture.css"), "utf8");
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    '<!doctype html><html><head></head><body><main id="app"></main></body></html>',
  );
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ path: bundle });
  const button = page.locator(".page-preview .govbb-button");
  await button.waitFor();

  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 });

    const style = await button.evaluate((element) => {
      const computed = getComputedStyle(element);

      return {
        color: computed.color,
        background: computed.backgroundColor,
        decoration: computed.textDecorationLine,
      };
    });

    const values = [luminance(style.color), luminance(style.background)].sort(
      (left, right) => left - right,
    );

    assert.ok(
      (values[1] + 0.05) / (values[0] + 0.05) >= 4.5,
      `Primary action contrast at ${width}px`,
    );
    assert.equal(style.decoration, "none");
    assert.equal(
      await page
        .locator(".govbb-table__cell--numeric")
        .evaluate((cell) => getComputedStyle(cell).textAlign),
      "right",
    );
    await button.focus();
    assert.equal(await button.evaluate((element) => document.activeElement === element), true);
    assert.notEqual(
      await button.evaluate((element) => getComputedStyle(element).outlineStyle),
      "none",
    );
  }

  assert.deepEqual(errors, []);
  console.log(
    "PASS page preview: readable primary actions, numeric alignment and keyboard focus at desktop and phone widths",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
