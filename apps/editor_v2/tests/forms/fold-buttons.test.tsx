/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EditorComposer } from "../../src/editor/react/composer";
import { FormEditor } from "../../src/forms/react/form-editor";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";

const rect = new DOMRect(0, 0, 600, 40);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
  // jsdom lays nothing out: every line of text is one box
  Range.prototype.getClientRects = () =>
    Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("fold buttons name the blocks they fold and say whether they show", async () => {
  const { state } = govbbFormCodec.prepare(
    // jsdom's import.meta.url isn't a file, so the fixture is read from the app's folder, where the tests run
    readFileSync(resolve("tests/fixtures/forms/demo.canonical.md"), "utf8"),
  );

  if (!state) throw new Error("Expected a form the canvas can show");
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <EditorComposer definition={govbbFormEditor} initialState={state}>
        <FormEditor />
      </EditorComposer>,
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

  const folds = [...document.querySelectorAll("button")].flatMap((button) =>
    button.getAttribute("aria-label")?.startsWith("Fold ")
      ? [[button.getAttribute("aria-label"), button.getAttribute("aria-expanded")]]
      : [],
  );

  // Each page and question that has blocks to fold, all of them shown
  expect(folds.length).toBeGreaterThan(1);

  for (const [label, expanded] of folds) {
    expect(label).toMatch(/^Fold (page, )?\d+ blocks?$/);
    expect(expanded).toBe("true");
  }

  expect(folds.some(([label]) => label?.startsWith("Fold page, "))).toBe(true);
  expect(folds.some(([label]) => !label?.startsWith("Fold page, "))).toBe(true);
  await act(async () => root.unmount());
});
