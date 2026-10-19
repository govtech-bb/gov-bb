/** @vitest-environment jsdom */
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { PageDraftEditor } from "../../src/host/page-editor";
import type { DraftStorage } from "../../src/persistence/types";
import { openDocument } from "../../src/workspace/documents";
import { documentKeys } from "../../src/workspace/model";
import { renderInPage } from "../helpers/page-editor";

beforeEach(() => {
  // The settings panel sits beside the page, as on a wide screen
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
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

function page(storage: DraftStorage) {
  const keys = documentKeys("page");
  storage.setItem(
    keys.committed,
    "---\ntitle: Renew a passport\n---\n\nBring your old passport.\n",
  );

  return openDocument(
    { id: "page", title: "Renew a passport", kind: "page", role: "entry", keys },
    storage,
  );
}

const bar = () => document.querySelector('[role="toolbar"][aria-label="Page tools"]')!;

const notices = () => bar().nextElementSibling;

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((item) => item.textContent === name);

/** Retitles the page on the canvas, then saves it at once rather than after the pause in typing. */
async function retitle(title: string) {
  const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Page title"]')!;

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      field,
      title,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("a browser draft says it's saved in this browser, and a failed save says why with a way out", async () => {
  const { store: browser, state } = storage();
  const store = page(browser);

  await renderInPage(<PageDraftEditor store={store} />);
  expect(bar().textContent).toContain("Saved in this browser");

  state.full = true;
  await retitle("Renew a Barbados passport");
  await act(async () => store.flush());

  expect(bar().textContent).toContain("Not saved");
  expect(bar().textContent).not.toContain("Saved in this browser");
  // The reason is on the page, not in a tooltip, with the ways out beside it
  expect(notices()?.textContent).toContain("Storage quota reached");
  expect(button("Download a copy")).toBeDefined();

  state.full = false;
  await act(async () => button("Try again")!.click());
  expect(bar().textContent).toContain("Saved in this browser");
  expect(notices()?.textContent ?? "").not.toContain("Storage quota reached");
});

test("a problem with the browser copy outranks where the page stands in the content API", async () => {
  const { store: browser, state } = storage();
  const store = page(browser);

  await renderInPage(<PageDraftEditor store={store} server={{ status: "unpublished" }} />);
  expect(bar().textContent).toContain("Unpublished changes");

  state.full = true;
  await retitle("Renew a Barbados passport");
  await act(async () => store.flush());
  expect(bar().textContent).toContain("Not saved");
  expect(bar().textContent).not.toContain("Unpublished changes");
});
