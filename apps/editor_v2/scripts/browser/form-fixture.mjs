import { mkdtemp, readFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";

const demoSource = await readFile(
  new URL("../../docs/examples/demo-form.md", import.meta.url),
  "utf8",
);

const directory = await mkdtemp(join(tmpdir(), "editor-form-fixture-"));

process.once("exit", () => rmSync(directory, { recursive: true, force: true }));

await buildBrowserFixture("tests/browser/editor-host.tsx", join(directory, "form.js"));

const script = await readFile(join(directory, "form.js"), "utf8");

const css = await readFile(join(directory, "fixture.css"), "utf8");

const inputs = new WeakMap();

/** Supply explicit source to a test-only host. No app route or browser draft storage is involved. */
async function seedEditorSource(target, source, kind) {
  const existing = inputs.get(target);

  if (existing) {
    existing.source = source;
    existing.kind = kind;

    return;
  }

  const input = { source, kind };
  inputs.set(target, input);
  await target.route("**/__form-fixture*", (route) => {
    if (new URL(route.request().url()).pathname.endsWith(".js"))
      return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });

    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><meta charset="utf-8"><style id="cms-stylesheet">${css}</style></head><body><div id="app" data-cms-workspace></div><script>window.editorFixtureInput=${JSON.stringify(input).replaceAll("<", "\\u003c")};</script><script src="/__form-fixture.js"></script></body></html>`,
    });
  });
}

export const seedFormSource = (target, source = demoSource) =>
  seedEditorSource(target, source, "form");

/** Open a reusable page canvas without changing the API's metadata contract. */
export async function openPageFixture(page, base) {
  await seedEditorSource(page, "---\ntitle: Writer interactions\n---\n\n", "page");
  await page.goto(formFixtureUrl(base));
}

/** Intercepted by Playwright, never served as a production route. */
export function formFixtureUrl(base) {
  return new URL("/__form-fixture", base).href;
}

export async function openDemoForm(page, base) {
  await seedFormSource(page);
  await page.goto(formFixtureUrl(base));
}

/** Explicit export/reopen roundtrip for conversion tests, not browser recovery. */
export async function reloadEditorFromSource(page) {
  const { source, kind } = await page.evaluate(() => ({
    source: window.editorFixture.source(),
    kind: window.editorFixture.kind,
  }));

  await seedEditorSource(page, source, kind);
  await page.reload();
}
