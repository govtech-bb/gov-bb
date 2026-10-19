/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FormComposer } from "../../src/host/form-composer";
import { FormJsonDialog } from "../../src/host/form-json-dialog";
import { DraftStore } from "../../src/persistence";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { DraftProvider, SourceEditor } from "../../src/host/source-ui";
import { govbbFormEditor, govbbFormCodec } from "../../src/presets/govbb-form";
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
  const store = new DraftStore("---\ntitle: Renew a passport\n---\n\n", govbbPageCodec);

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
});

test("a failed form import looks different from one that worked", async () => {
  const store = new DraftStore(
    readFileSync(resolve("tests/fixtures/forms/demo.canonical.md"), "utf8"),
    govbbFormCodec,
  );

  await act(async () =>
    root.render(
      <FormComposer definition={govbbFormEditor} store={store}>
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
