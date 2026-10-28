/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FieldChip, fieldChip } from "./field-chip";

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

test("a field's answer is its icon and name, in the look a DOM-built reference takes too", async () => {
  await render(<FieldChip icon={<svg />}>Date of birth</FieldChip>);

  const chip = host.firstElementChild!;

  for (const part of fieldChip.split(" ")) expect(chip.classList).toContain(part);
  expect(chip.firstElementChild!.tagName).toBe("svg");
  // A long name is cut short rather than pushing its line wider
  expect(chip.lastElementChild!.className).toBe("truncate");
  expect(chip.textContent).toBe("Date of birth");
  // GovBB's one radius
  expect(fieldChip).toContain("rounded-sm");
});
