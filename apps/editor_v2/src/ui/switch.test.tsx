/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Switch } from "./switch";

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

const control = () => host.querySelector<HTMLElement>('[role="switch"]')!;

const click = (element: HTMLElement) => act(async () => element.click());

test("its label flips it on and off", async () => {
  const onCheckedChange = vi.fn();

  await render(<Switch label="Confirmation page" onCheckedChange={onCheckedChange} />);

  expect(control().getAttribute("aria-checked")).toBe("false");
  await click(host.querySelector("label span")!);
  expect(control().getAttribute("aria-checked")).toBe("true");
  expect(onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything());
  await click(control());
  expect(control().getAttribute("aria-checked")).toBe("false");
});

test("follows its checked prop when controlled", async () => {
  const onCheckedChange = vi.fn();

  await render(<Switch aria-label="Confirmation page" checked onCheckedChange={onCheckedChange} />);

  await click(control());
  expect(onCheckedChange).toHaveBeenLastCalledWith(false, expect.anything());
  expect(control().getAttribute("aria-checked")).toBe("true");
});
