/** @vitest-environment jsdom */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Drawer } from "./drawer";

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

function Panel({ side, inert }: { side: "start" | "end"; inert?: boolean }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <span data-open={open} />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side={side}
        id="panel"
        label="Settings"
        inert={inert}
      >
        <input aria-label="Visibility" />
      </Drawer>
    </>
  );
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

test("it is titled by its label, holds its content and closes from its own button", async () => {
  await act(async () => root.render(<Panel side="end" />));

  expect(dialog()?.id).toBe("panel");
  expect(document.getElementById(dialog()!.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Settings",
  );
  expect(dialog()?.querySelector('[aria-label="Visibility"]')).not.toBeNull();

  await act(async () =>
    dialog()!.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click(),
  );
  await vi.waitFor(() =>
    expect(host.querySelector("[data-open]")?.getAttribute("data-open")).toBe("false"),
  );
});

test("it comes from the edge it's given", async () => {
  await act(async () => root.render(<Panel side="start" />));

  expect(dialog()?.className).toContain("-translate-x-full");
  expect(dialog()?.parentElement?.className).toContain("justify-start");
});

test("its content can be put out of reach while the title row stays usable", async () => {
  await act(async () => root.render(<Panel side="end" inert />));

  expect(dialog()?.querySelector('[aria-label="Visibility"]')?.closest("[inert]")).not.toBeNull();
  expect(dialog()?.querySelector('[aria-label="Close"]')?.closest("[inert]")).toBeNull();
});
