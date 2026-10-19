/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { createGovbbDraft, MARKDOWN_KEY } from "../../src/host/govbb-draft";
import { PageDraftEditor } from "../../src/host/page-editor";
import type { DraftStorage } from "../../src/persistence/types";
import { openDocument } from "../../src/workspace/documents";
import { WorkspaceFormEditor } from "../../src/workspace/form-editor";
import { documentKeys } from "../../src/workspace/model";
import { renderInPage } from "../helpers/page-editor";

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

beforeEach(() => {
  // The settings panel sits beside the page, as on a wide screen
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  // jsdom lays nothing out: every line of the form's text is one box
  const rect = new DOMRect(0, 0, 600, 40);
  Range.prototype.getClientRects = () =>
    Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) });
});

const notices = (label: string) =>
  document.querySelector(`[role="toolbar"][aria-label="${label}"]`)?.nextElementSibling;

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((item) => item.textContent === name);

const dialog = () => document.querySelector('[role="dialog"]');

test("a page with Markdown changes waiting says editing is paused, and its button opens them", async () => {
  const storage = memoryStorage();
  const keys = documentKeys("page");
  storage.setItem(
    keys.committed,
    "---\ntitle: Renew a passport\n---\n\nBring your old passport.\n",
  );

  const store = openDocument(
    { id: "page", title: "Renew a passport", kind: "page", role: "entry", keys },
    storage,
  );

  await renderInPage(<PageDraftEditor store={store} />);
  expect(notices("Page tools")?.textContent).toBe("");

  await act(async () => store.edit(`${store.getSnapshot().source}\nA line not yet applied.\n`));

  expect(notices("Page tools")?.textContent).toBe(
    "Editing is pausedYour Markdown changes haven't been applied.Review Markdown changes",
  );
  expect(document.querySelector(".page-document-writing")?.hasAttribute("inert")).toBe(true);

  // The button opens the Markdown, where they're applied or discarded; not the file upload
  expect(dialog()).toBeNull();
  await act(async () => button("Review Markdown changes")!.click());
  expect(dialog()?.textContent).toContain("Page source");
  expect(button("Replace from file")).toBeDefined();
  expect(button("Open Markdown")).toBeUndefined();
});

test("a form's canvas no longer pauses silently: its bar says why", async () => {
  const storage = memoryStorage();
  // jsdom's import.meta.url isn't a file, so the fixture is read from the app's folder, where the tests run
  storage.setItem(
    MARKDOWN_KEY,
    readFileSync(resolve("tests/fixtures/forms/demo.canonical.md"), "utf8"),
  );

  const store = createGovbbDraft(storage);

  await renderInPage(<WorkspaceFormEditor store={store} active />);
  expect(notices("Form tools")?.textContent).toBe("");

  await act(async () => store.edit(`${store.getSnapshot().source}\nA line not yet applied.\n`));

  expect(notices("Form tools")?.textContent).toBe(
    "Editing is pausedYour Markdown changes haven't been applied.Review Markdown changes",
  );
  expect(document.querySelector(".form-builder-container .contents")?.hasAttribute("inert")).toBe(
    true,
  );
});
