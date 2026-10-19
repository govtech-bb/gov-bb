/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Checkbox } from "./checkbox";

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

const box = () => host.querySelector<HTMLElement>('[role="checkbox"]')!;

const click = (element: HTMLElement) => act(async () => element.click());

test("its label ticks and unticks it", async () => {
  const onCheckedChange = vi.fn();

  await render(<Checkbox label="Higher-risk category" onCheckedChange={onCheckedChange} />);

  expect(box().getAttribute("aria-checked")).toBe("false");
  await click(host.querySelector("label span:last-child")!);
  expect(box().getAttribute("aria-checked")).toBe("true");
  expect(onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything());
  await click(box());
  expect(box().getAttribute("aria-checked")).toBe("false");
});

test("a partly ticked box reads as mixed", async () => {
  await render(<Checkbox aria-label="Choose every row" indeterminate />);

  expect(box().getAttribute("aria-checked")).toBe("mixed");
  expect(box().getAttribute("aria-label")).toBe("Choose every row");
});

test("a disabled box ignores clicks", async () => {
  const onCheckedChange = vi.fn();

  await render(<Checkbox label="Required" disabled onCheckedChange={onCheckedChange} />);

  await click(box());
  expect(onCheckedChange).not.toHaveBeenCalled();
  expect(box().getAttribute("aria-checked")).toBe("false");
});
