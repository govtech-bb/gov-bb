/** @vitest-environment jsdom */
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Pill } from "./pill";
import { Popover } from "./popover";

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

// Types into an input as React hears it: through the native value setter, then an input event
const type = (input: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

test("holds an icon and typed words, reporting each change and taking a ref and input props", async () => {
  const onValueChange = vi.fn();
  const onBlur = vi.fn();
  const input = createRef<HTMLInputElement>();

  await render(
    <Pill>
      <Pill.Icon>
        <svg />
      </Pill.Icon>
      <Pill.Input
        ref={input}
        placeholder="Field name"
        onValueChange={onValueChange}
        onBlur={onBlur}
      />
    </Pill>,
  );

  expect(host.firstElementChild!.tagName).toBe("SPAN");
  expect(input.current!.getAttribute("aria-label")).toBe("Field name");
  await type(input.current!, "Total");
  expect(onValueChange).toHaveBeenLastCalledWith("Total");
  expect(input.current!.value).toBe("Total");
  // The invisible copy that sizes the input follows the words
  expect(input.current!.previousElementSibling!.textContent).toBe("Total");
  await act(async () =>
    input.current!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(onBlur).toHaveBeenCalled();
});

test("a label names its input where the placeholder doesn't", async () => {
  await render(
    <Pill>
      <Pill.Input label="Name" placeholder="Field name" />
    </Pill>,
  );

  expect(host.querySelector("input")!.getAttribute("aria-label")).toBe("Name");
});

test("renders as a trigger, which opens its popup and is pressable", async () => {
  await render(
    <Popover.Root>
      <Pill render={<Popover.Trigger />} data-placeholder="">
        Date
        <Pill.Caret />
      </Pill>
      <Popover.Content aria-label="Date">A calendar</Popover.Content>
    </Popover.Root>,
  );

  const trigger = host.querySelector("button")!;

  expect(trigger.className).toContain("cursor-pointer");
  expect(trigger.className).toContain("data-placeholder:text-muted");
  expect(trigger.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
});

test("its quiet tone greys the fill but keeps the 3:1 edge, the muted placeholder and the one radius", async () => {
  await render(<Pill tone="quiet">all</Pill>);

  const quiet = host.firstElementChild!.className.split(" ");

  expect(quiet).toContain("bg-tint");
  expect(quiet).not.toContain("bg-white");
  expect(quiet).toEqual(
    expect.arrayContaining(["shadow-input", "rounded-sm", "data-placeholder:text-muted"]),
  );
  expect(quiet).toContain("pointer-coarse:min-h-11");
});
