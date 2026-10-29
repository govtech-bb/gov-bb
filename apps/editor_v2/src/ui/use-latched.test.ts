/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { useLatched } from "./use-latched";

test("gives the value while there is one, then the last one, until there's another", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const seen: (string | null)[] = [];

  function Probe({ value }: { value: string | null }) {
    seen.push(useLatched(value));

    return null;
  }

  const root = createRoot(document.createElement("div"));

  for (const value of [null, "Edit Health", null, null, "Delete Arts", null])
    await act(async () => root.render(createElement(Probe, { value })));

  // Nothing before the first; once closed, still what it showed open
  expect(seen).toEqual([
    null,
    "Edit Health",
    "Edit Health",
    "Edit Health",
    "Delete Arts",
    "Delete Arts",
  ]);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
