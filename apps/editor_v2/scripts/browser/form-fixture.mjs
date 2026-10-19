import { readFile } from "node:fs/promises";

/** The demo form's Markdown, which `docs/examples/editor-system.test.ts` keeps equal to the native demo. */
const demoSource = await readFile(
  new URL("../../docs/examples/demo-form.md", import.meta.url),
  "utf8",
);

/**
 * A new browser gets no form, so the form suites set theirs up at the storage boundary: before the editor reads an
 * empty browser's storage, the original form draft is written there (the demo unless a suite brings its own source).
 * `target` is a Playwright page or context; storage a suite has already filled is left alone.
 */
export async function seedFormDraft(target, source = demoSource) {
  await target.addInitScript((source) => {
    if (localStorage.length === 0) localStorage.setItem("govbb-editor:draft:markdown:v2", source);
  }, source);
}

/** The original form draft's own route, under the service the workspace gives it. */
export function formDraftUrl(base) {
  return new URL("/services/existing-original/form-original", base).href;
}

/** Seed the demo form in a new browser and open it. */
export async function openDemoForm(page, base) {
  await seedFormDraft(page);
  await page.goto(formDraftUrl(base));
}
