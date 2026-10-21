/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { DraftCanvas, FormComposer } from "../../src/host/form-composer";
import { SourceEditor } from "../../src/host/source-ui";
import { PausedNotice } from "../../src/host/paused-notice";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { DraftStore } from "../../src/persistence";
import { renderInPage } from "../helpers/page-editor";

beforeEach(() => {
  // Show toolbar labels as on a wide screen.
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

test("a form's canvas no longer pauses silently: its bar says why", async () => {
  // jsdom's import.meta.url isn't a file, so the fixture is read from the app's folder, where the tests run
  const store = new DraftStore(
    readFileSync(resolve("tests/fixtures/forms/demo.canonical.md"), "utf8"),
    govbbFormCodec,
  );

  await renderInPage(
    <FormComposer definition={govbbFormEditor} store={store}>
      <div role="toolbar" aria-label="Form tools">
        <SourceEditor />
      </div>
      <div>
        <PausedNotice documentLabel="form" />
      </div>
      <DraftCanvas>Form canvas</DraftCanvas>
    </FormComposer>,
  );
  expect(notices("Form tools")?.textContent).toBe("");

  await act(async () => store.edit(`${store.getSnapshot().source}\nA line not yet applied.\n`));

  expect(notices("Form tools")?.textContent).toBe(
    "Editing is pausedYour Markdown changes haven't been applied.Review Markdown changes",
  );
  expect(document.querySelector(".contents[inert]")).not.toBeNull();
});
