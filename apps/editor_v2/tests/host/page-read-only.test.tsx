/** @vitest-environment jsdom */
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { PageDraftEditor } from "../../src/host/page-editor";
import { DraftProvider, SourceEditor } from "../../src/host/source-ui";
import { DraftStore } from "../../src/persistence/draft-store";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { pageControl, renderInPage } from "../helpers/page-editor";

beforeEach(() =>
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: true,
    media,
    addEventListener() {},
    removeEventListener() {},
  })),
);

const source = "---\ntitle: Fees\n---\n\nOriginal content\n";

const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name,
  );

  if (!found) throw new Error(`Missing source control: ${name}`);

  return found;
};

test("host read-only blocks source application and replacement but preserves unapplied text and exports", async () => {
  const store = new DraftStore(source, govbbPageCodec);
  await renderInPage(
    <DraftProvider store={store}>
      <SourceEditor inline />
    </DraftProvider>,
  );
  await act(async () => store.edit("---\ntitle: [unfinished\n---\nUnapplied source"));
  const before = store.getSnapshot();
  await renderInPage(
    <DraftProvider store={store} readOnly>
      <SourceEditor inline />
    </DraftProvider>,
  );
  expect(pageControl<HTMLTextAreaElement>("textarea").readOnly).toBe(true);
  expect(button("Apply changes").disabled).toBe(true);
  expect(button("Replace from file").disabled).toBe(true);
  expect(button("Discard changes").disabled).toBe(true);
  expect(button("Copy source").disabled).toBe(false);
  expect(button("Download source").disabled).toBe(false);
  await act(async () => button("Apply changes").click());
  expect(store.getSnapshot()).toBe(before);
});

test("loss of host authority keeps the canvas and its recovery state while gating metadata and undo", async () => {
  let failEncoding = false;

  const store = new DraftStore(source, {
    ...govbbPageCodec,
    encode(state) {
      if (failEncoding) throw new Error("Test canvas serialization failure");

      return govbbPageCodec.encode(state);
    },
  });

  await renderInPage(<PageDraftEditor store={store} />);
  const content = pageControl('[aria-label="Page content"]');
  const state = govbbPageCodec.prepare(source + "\nMore canvas content").state;

  if (!state) throw new Error("Expected visual page fixture");
  failEncoding = true;
  await act(async () => store.canvasChanged(state));
  const before = store.getSnapshot();
  expect(before.recovery?.kind).toBe("canvas");
  await renderInPage(<PageDraftEditor store={store} readOnly />);
  expect(pageControl('[aria-label="Page content"]')).toBe(content);
  expect(content.getAttribute("contenteditable")).toBe("false");
  expect(pageControl<HTMLTextAreaElement>('textarea[aria-label="Page title"]').readOnly).toBe(true);
  expect(pageControl<HTMLButtonElement>('[aria-label="Undo"]').disabled).toBe(true);
  expect(pageControl<HTMLButtonElement>('[aria-label="Redo"]').disabled).toBe(true);
  expect(store.getSnapshot()).toBe(before);
  expect(store.getSnapshot().recovery?.original).toBe(JSON.stringify(state));
});
