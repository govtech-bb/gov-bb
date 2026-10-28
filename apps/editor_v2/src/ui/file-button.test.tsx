/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { FileButton } from "./file-button";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("its button opens the hidden file input, and the file chosen comes to onFile, as often as it's chosen", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onFile = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <FileButton accept=".md,text/markdown" onFile={onFile}>
        Replace from file
      </FileButton>,
    ),
  );

  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const opened = vi.spyOn(input, "click");

  expect(input.hidden).toBe(true);
  expect(input.accept).toBe(".md,text/markdown");
  await act(async () => document.querySelector("button")!.click());
  expect(opened).toHaveBeenCalledOnce();

  const file = new File(["# Fees"], "fees.md", { type: "text/markdown" });

  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(onFile).toHaveBeenCalledWith(file);
  // Emptied, so the same file chosen again is a change again
  expect(input.value).toBe("");
  await act(async () => root.unmount());
});
