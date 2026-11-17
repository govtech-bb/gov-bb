/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Tag } from "./tag";

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

test("removes itself from a button named for what it removes", async () => {
  const onRemove = vi.fn();

  await render(
    <Tag onRemove={onRemove} removeLabel="Remove Business and trade">
      Business and trade
    </Tag>,
  );

  const remove = host.querySelector("button")!;

  expect(host.textContent).toBe("Business and trade");
  expect(remove.getAttribute("aria-label")).toBe("Remove Business and trade");
  await act(async () => remove.click());
  expect(onRemove).toHaveBeenCalledOnce();
});

test("has no button when it can't be removed", async () => {
  await render(<Tag tone="neutral">Imported</Tag>);

  expect(host.querySelector("button")).toBeNull();
});
