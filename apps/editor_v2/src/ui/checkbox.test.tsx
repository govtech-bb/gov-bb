/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Checkbox, CheckboxMark } from "./checkbox";

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

test("className styles the box and labelClassName its row, 44px under a coarse pointer", async () => {
  await render(<Checkbox label="Bold" className="me-1" labelClassName="py-1" />);

  const label = host.querySelector("label")!;

  expect(box().className).toContain("me-1");
  expect(label.className).toContain("py-1");
  expect(label.className).not.toContain("me-1");
  expect(label.className).toContain("pointer-coarse:min-h-11");
});

test("a small one has a 12px label, its box level with the first line", async () => {
  await render(<Checkbox label="Italic" size="sm" />);

  expect(host.querySelector("label")!.className).toContain("text-12");
  expect(box().className).not.toContain("mt-0.5");
});

test("a row that is the checkbox itself draws the same box, ticked, partly ticked or not, unheard", async () => {
  await render(
    <>
      <CheckboxMark checked />
      <CheckboxMark checked="mixed" />
      <CheckboxMark checked={false} />
    </>,
  );

  const [ticked, partly, unticked] = [...host.children];

  expect(ticked!.getAttribute("aria-hidden")).toBe("true");
  expect(ticked!.hasAttribute("data-checked")).toBe(true);
  expect(partly!.hasAttribute("data-indeterminate")).toBe(true);
  expect(unticked!.querySelector("svg")).toBeNull();
  // The tick is the bold one a Checkbox draws
  await render(<Checkbox aria-label="Bold" defaultChecked />);
  expect(box().querySelector("path")!.getAttribute("d")).toBe(
    ticked!.querySelector("path")!.getAttribute("d"),
  );
});
