/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Tip, tipPopup } from "./tooltip";

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

// The tooltip's popup, in its portal outside the root
const popup = () => document.querySelector<HTMLElement>("[data-side]")?.firstElementChild;

test("focused, its trigger shows its tip, on the side it's given", async () => {
  await render(
    <Tip content="Undo" side="top">
      <button type="button" aria-label="Undo" />
    </Tip>,
  );

  const trigger = host.querySelector("button")!;

  expect(trigger.hasAttribute("data-base-ui-tooltip-trigger")).toBe(true);
  await act(async () => trigger.focus());
  await vi.waitFor(() => expect(popup()?.textContent).toBe("Undo"));
  expect(document.querySelector("[data-side]")?.getAttribute("data-side")).toBe("top");
  // Centred under it, its words too
  expect(popup()?.className).toContain("text-center");
});

test("disabled, it never shows, and its trigger is left as it is", async () => {
  await render(
    <Tip content="Markdown" disabled>
      <button type="button">Markdown</button>
    </Tip>,
  );

  await act(async () => host.querySelector("button")!.focus());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(popup()).toBeUndefined();
  expect(host.querySelector("button")!.textContent).toBe("Markdown");
});

test("lined up at its start, its lines start there too", async () => {
  await render(
    <Tip content="Fold 3 blocks" align="start" open>
      <button type="button">Fold</button>
    </Tip>,
  );

  await vi.waitFor(() => expect(popup()?.textContent).toBe("Fold 3 blocks"));
  expect(document.querySelector("[data-align]")?.getAttribute("data-align")).toBe("start");
  expect(popup()?.className).toContain("text-start");
});

test("without a trigger, it points at its anchor while its owner holds it open", async () => {
  const mark = document.body.appendChild(document.createElement("span"));

  await render(<Tip content="This field no longer exists" anchor={mark} open />);
  await vi.waitFor(() => expect(popup()?.textContent).toBe("This field no longer exists"));
  // In the look an imperative tooltip can borrow
  expect(popup()?.className).toContain(tipPopup.split(" ")[0]);

  await render(<Tip content="This field no longer exists" anchor={mark} open={false} />);
  await vi.waitFor(() => expect(popup()).toBeUndefined());
  mark.remove();
});
