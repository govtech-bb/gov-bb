import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { parse } from "yaml";
import { chromium } from "./playwright.mjs";

// The reference is the normal published route, never the retired preview route.
const origin = process.argv[2] ?? "http://127.0.0.1:3040";

const editorOrigin = process.argv[3] ?? "http://127.0.0.1:3060";

const path = "/work-employment/apply-to-be-a-project-protege-mentor";

const markdown = await readFile(
  new URL(
    "../../../landing/src/content/apply-to-be-a-project-protege-mentor/index.md",
    import.meta.url,
  ),
  "utf8",
);

const [, yaml, body] = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);

const browser = await chromium.launch();

const directory = process.env.PREVIEW_SCREENSHOTS ?? "/tmp/govbb-site-preview";

await mkdir(directory, { recursive: true });

const measure = (page) =>
  page.evaluate(() => {
    const selectors = [
      "header",
      "h1",
      ".govbb-prose",
      ".govbb-prose h2",
      ".govbb-prose p",
      "footer",
    ];

    return selectors.map((selector) => {
      const element = document.querySelector(selector);

      if (!element) throw new Error(`Missing public-page element: ${selector}`);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      return {
        selector,
        x: Math.round(rect.x * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        color: style.color,
      };
    });
  });

try {
  for (const width of [390, 800, 1000, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const reference = await context.newPage();
    await reference.goto(`${origin}${path}`);
    await reference.locator(".govbb-prose").waitFor();
    await reference.evaluate(() => document.fonts.ready);
    const expected = await measure(reference);

    const breadcrumbs = await reference.locator(".govbb-breadcrumbs a").evaluateAll((links) =>
      links.map((link) => ({
        label: link.textContent.trim(),
        href: new URL(link.href).pathname,
      })),
    );

    assert.ok(breadcrumbs.length, "normal page supplies its own breadcrumb reference");
    const available = (await reference.locator(".govbb-prose a.govbb-button").count()) > 0;
    const preview = await context.newPage();
    const errors = [];
    preview.on("pageerror", (error) => errors.push(error.message));
    await preview.route("**/__site-preview-parity", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/cms-preview/styles.css"></head><body><div id="preview"></div></body></html>`,
      }),
    );
    await preview.goto(`${editorOrigin}/__site-preview-parity`);
    await preview.evaluate(
      async ({ frontmatter, body, path, breadcrumbs, available }) => {
        const { mountCmsPreview } = await import("/cms-preview/renderer.js");
        window.previewHandle = await mountCmsPreview(
          document.getElementById("preview"),
          {
            frontmatter,
            body,
            path,
            breadcrumbs,
            formStatus: available ? "available" : "unavailable",
          },
          location.origin,
        );
        await document.fonts.ready;
      },
      { frontmatter: parse(yaml), body, path, breadcrumbs, available },
    );
    await preview.locator(".govbb-prose").waitFor();
    assert.deepEqual(
      await measure(preview),
      expected,
      `public layout and typography at ${width}px`,
    );
    const html = (value) => value.replaceAll("<!-- -->", ""); // React SSR text separators are not page content.
    assert.equal(
      html(await preview.locator(".govbb-prose").innerHTML()),
      html(await reference.locator(".govbb-prose").innerHTML()),
    );
    assert.equal(await preview.locator("iframe").count(), 0);
    assert.deepEqual(errors, []);
    await reference.screenshot({ path: `${directory}/reference-${width}.png`, fullPage: true });
    await preview.screenshot({ path: `${directory}/preview-${width}.png`, fullPage: true });
    await context.close();
    console.log(`Normal page / fresh preview parity: ${width}px passed`);
  }
} finally {
  await browser.close();
}
