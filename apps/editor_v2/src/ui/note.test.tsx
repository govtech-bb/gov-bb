/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Note } from "./note";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

test("is 12px small print, muted unless it's an error or a warning", async () => {
  await render(
    <>
      <Note id="alias-help">Used when the label is blank.</Note>
      <Note tone="error">Enter a whole number</Note>
      <Note tone="warning">Check answers goes before the declaration</Note>
    </>,
  );

  const [muted, error, warning] = [...host.children];

  expect(muted!.id).toBe("alias-help");
  expect(muted!.className).toContain("text-12");
  expect(muted!.className).toContain("text-muted");
  expect(error!.className).toContain("text-error");
  expect(error!.querySelector("svg")).toBeNull();
  // A warning keeps the ink, so its sign tells it apart
  expect(warning!.className).toContain("text-ink");
  expect(warning!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  expect(warning!.textContent).toBe("Check answers goes before the declaration");
});
