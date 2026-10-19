/** @vitest-environment jsdom */
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { PageDraftEditor } from "../../src/host/page-editor";
import { DraftStore } from "../../src/persistence";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { renderInPage } from "../helpers/page-editor";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

const source = "---\ntitle: Renew a passport\n---\n\nBring your old passport.\n";

const bar = () => document.querySelector('[role="toolbar"][aria-label="Page tools"]')!;

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((item) => item.textContent === name);

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

test("an in-memory host never claims a local edit was saved", async () => {
  const store = new DraftStore(source, govbbPageCodec);
  await renderInPage(<PageDraftEditor store={store} />);
  expect(bar().textContent).toContain("Unsaved changes");
  await retitle("Renew a Barbados passport");
  expect(bar().textContent).toContain("Unsaved changes");
  await act(async () => {
    store.edit(store.getSnapshot().source + "\nMore instructions.\n");
    store.apply();
  });
  expect(bar().textContent).toContain("Unsaved changes");
});

test("serialization failure outranks server feedback, preserves a download, and retries without claiming a save", async () => {
  let fail = false;

  const store = new DraftStore(source, {
    ...govbbPageCodec,
    encode: (state) => {
      if (fail) throw new Error("Cannot serialize this page");

      return govbbPageCodec.encode(state);
    },
  });

  await renderInPage(<PageDraftEditor store={store} server={{ status: "unpublished" }} />);
  expect(bar().textContent).toContain("Unpublished changes");
  fail = true;
  await retitle("Keep this title");
  expect(bar().textContent).toContain("Not saved");
  expect(bar().nextElementSibling?.textContent).toContain("Cannot serialize this page");
  expect(button("Download a copy")).toBeDefined();
  fail = false;
  await act(async () => button("Try again")!.click());
  expect(bar().textContent).toContain("Unpublished changes");
  expect(store.getSnapshot().committed).toContain("Keep this title");
});
