/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FormComposer } from "../../src/host/form-composer";
import { FormJsonDialog } from "../../src/host/form-json-dialog";
import { createGovbbDraft, MARKDOWN_KEY } from "../../src/host/govbb-draft";
import { DraftProvider, SourceEditor } from "../../src/host/source-ui";
import type { DraftStorage } from "../../src/persistence/types";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { newPage, openDocument } from "../../src/workspace/documents";
import pension from "../fixtures/forms/v2/pension.json";

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  root = createRoot(document.body.appendChild(document.createElement("div")));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** A browser's storage that can be made to refuse writes, as when it's full. */
function storage() {
  const values = new Map<string, string>();
  const state = { full: false };

  const store: DraftStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (state.full) throw new DOMException("Storage quota reached", "QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key) => void values.delete(key),
  };

  return { store, state };
}

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((item) => item.textContent === name);

/** The message in a dialog's body that says what came of acting there, found by its words. */
const outcome = (text: string) =>
  [...document.querySelectorAll('[role="alert"], [role="status"]')].find((message) =>
    message.textContent?.includes(text),
  );

/** Chooses a file in a hidden file input, named by its label, and lets it be read. */
async function choose(label: string, file: File) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {});
}

test("the Markdown dialog shows what came of each action in its body, in its own tone", async () => {
  const { store: browser, state } = storage();
  const store = openDocument(newPage("Renew a passport", "entry").document, browser);

  await act(async () =>
    root.render(
      <DraftProvider store={store}>
        <SourceEditor inline documentLabel="page" fileName="page.md" />
      </DraftProvider>,
    ),
  );

  await act(async () => store.edit(`${store.getSnapshot().source}\nA new line.\n`));
  await act(async () => button("Apply changes")!.click());

  const applied = outcome("Changes applied");

  expect(applied?.getAttribute("role")).toBe("status");
  expect(applied?.className).toContain("bg-green-10");

  const unreadable = new File(["# A page"], "page.md");
  unreadable.text = () => Promise.reject(new Error("The disk went away"));
  await choose("Markdown file to replace from", unreadable);

  const failed = outcome("The file could not be read");

  expect(failed?.getAttribute("role")).toBe("alert");
  expect(failed?.className).toContain("bg-red-10");
  expect(outcome("Changes applied")).toBeUndefined();

  // A failed save says why in the dialog, with its way out, rather than a button in the footer
  state.full = true;
  await act(async () => store.edit(`${store.getSnapshot().source}\nAnother line.\n`));
  expect(document.body.textContent).toContain("Storage quota reached");
  expect(button("Try again")).toBeDefined();
  expect(button("Download a copy")).toBeDefined();
  expect(button("Try saving again")).toBeUndefined();
});

test("a failed form import looks different from one that worked", async () => {
  const browser = storage().store;
  // jsdom's import.meta.url isn't a file, so the fixture is read from the app's folder, where the tests run
  browser.setItem(
    MARKDOWN_KEY,
    readFileSync(resolve("tests/fixtures/forms/demo.canonical.md"), "utf8"),
  );

  await act(async () =>
    root.render(
      <FormComposer definition={govbbFormEditor} store={createGovbbDraft(browser)}>
        <FormJsonDialog />
      </FormComposer>,
    ),
  );
  await act(async () => button("JSON")!.click());

  await choose("Open form JSON file", new File(["{ not a form"], "broken.json"));

  const failed = outcome("Correct its errors before importing it");

  expect(failed?.getAttribute("role")).toBe("alert");
  expect(failed?.className).toContain("bg-red-10");

  await choose("Open form JSON file", new File([JSON.stringify(pension)], "pension.json"));
  expect(outcome("Ready to review and apply")?.className).toContain("bg-blue-10");
  await act(async () => button("Apply import")!.click());

  const imported = outcome("Form imported");

  expect(imported?.getAttribute("role")).toBe("status");
  expect(imported?.className).toContain("bg-green-10");
  expect(outcome("Correct its errors")).toBeUndefined();
});
