/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PreviewQuestion, PreviewSheet } from "./preview-sheet";

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

test("a sheet is a picture: hidden from screen readers, with the question's parts in GovBB's order", async () => {
  await act(async () =>
    root.render(
      <PreviewSheet>
        <PreviewQuestion label="Passport number" hint="For example, 502135326" optional>
          <span data-answer="">box</span>
        </PreviewQuestion>
      </PreviewSheet>,
    ),
  );

  const sheet = host.firstElementChild!;
  expect(sheet.getAttribute("aria-hidden")).toBe("true");
  expect(sheet.textContent).toBe("Passport number(optional)For example, 502135326box");
});

test("a required question has no optional mark, and a label alone draws no answer", async () => {
  await act(async () =>
    root.render(
      <PreviewSheet>
        <PreviewQuestion label="Which roads do you need to close?" />
      </PreviewSheet>,
    ),
  );

  expect(host.textContent).toBe("Which roads do you need to close?");
  expect(host.querySelectorAll(".mt-2")).toHaveLength(0);
});
