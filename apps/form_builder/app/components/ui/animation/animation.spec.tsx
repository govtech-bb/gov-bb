/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListHighlight, pickNearest } from "./list-highlight";
import { AnimatedText } from "./animated-text";
import { createPortal } from "react-dom";
import { Flow } from "../flow";
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("prefers containing rows over nearer centres and finds the nearest item in gaps", () => {
  const rows = [
    { top: 0, left: 0, width: 100, height: 80 },
    { top: 84, left: 0, width: 100, height: 16 },
  ];
  expect(pickNearest(rows, { x: 20, y: 78 }, "y")).toBe(0);
  expect(pickNearest(rows, { x: 20, y: 82 }, "y")).toBe(1);
  const grid = [
    { left: 0, top: 0, width: 40, height: 20 },
    { left: 60, top: 40, width: 40, height: 20 },
  ];
  expect(pickNearest(grid, { x: 80, y: 0 }, "x")).toBe(1);
  expect(pickNearest(grid, { x: 55, y: 45 }, "xy")).toBe(1);
  expect(pickNearest([], { x: 0, y: 0 }, "y")).toBe(-1);
});
it("keeps native clicks, skips disabled rows and clears a removed hover target", async () => {
  const click = vi.fn();
  const move = vi.fn();
  const { container, rerender } = render(
    <ListHighlight itemSelector="button" onMouseMove={move}>
      <button onClick={click}>First</button>
      <button disabled>Disabled</button>
    </ListHighlight>,
  );
  const list = container.firstElementChild as HTMLElement;
  const buttons = Array.from(list.querySelectorAll("button"));
  buttons.forEach((button, index) => {
    Object.defineProperties(button, {
      offsetTop: { value: index * 40 },
      offsetLeft: { value: 0 },
      offsetWidth: { value: 100, configurable: true },
      offsetHeight: { value: 32 },
      offsetParent: { value: list },
    });
    // Screen coordinates can differ from layout coordinates inside scaled popups.
    button.getBoundingClientRect = () => ({
      x: 10,
      y: index * 20 + 10,
      left: 10,
      top: index * 20 + 10,
      right: 60,
      bottom: index * 20 + 26,
      width: 50,
      height: 16,
      toJSON() {},
    });
  });
  fireEvent.mouseMove(list, { clientX: 20, clientY: 34 });
  await waitFor(() =>
    expect(buttons[0]).toHaveAttribute("data-ui-hover-active"),
  );
  expect(buttons[1]).not.toHaveAttribute("data-ui-hover-active");
  expect(list.querySelector(".ui-highlight")).toHaveStyle({
    width: "100px",
    height: "32px",
    opacity: "1",
  });
  expect(move).toHaveBeenCalled();
  fireEvent.click(list);
  fireEvent.click(buttons[1]);
  expect(click).not.toHaveBeenCalled();
  fireEvent.click(buttons[0]);
  expect(click).toHaveBeenCalledOnce();
  fireEvent.mouseLeave(list);
  await waitFor(() =>
    expect(list.querySelector(".ui-highlight")).toHaveStyle({
      opacity: "0",
    }),
  );
  Object.defineProperty(buttons[0], "offsetWidth", { value: 64 });
  fireEvent.scroll(list);
  await waitFor(() =>
    expect(list.querySelector(".ui-highlight")).toHaveStyle({
      width: "64px",
      opacity: "0",
    }),
  );
  fireEvent.mouseMove(list, { clientX: 20, clientY: 15 });
  await waitFor(() =>
    expect(buttons[0]).toHaveAttribute("data-ui-hover-active"),
  );
  rerender(
    <ListHighlight itemSelector="button">
      <button key="disabled" disabled>
        Disabled
      </button>
    </ListHighlight>,
  );
  await waitFor(() => {
    expect(list.querySelector("[data-ui-hover-active]")).toBeNull();
    expect(buttons[0]).not.toHaveAttribute("data-ui-item");
  });
});
it("reserves plain label width without duplicating accessible names or rich content", () => {
  const { container } = render(
    <>
      <button>
        <AnimatedText active>Save</AnimatedText>
      </button>
      <AnimatedText>
        <label htmlFor="rich-label">Title</label>
        <input id="rich-label" />
      </AnimatedText>
    </>,
  );
  expect(screen.getByRole("button", { name: "Save" })).toHaveAccessibleName(
    "Save",
  );
  expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
  expect(container.querySelectorAll("#rich-label")).toHaveLength(1);
});
it("pans the flow with native scrolling and only reports changed overflow", () => {
  const observers = new Map<Element, () => void>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe(element: Element) {
        observers.set(element, this.callback);
      }
      disconnect() {}
    },
  );
  const overflow = vi.fn();
  const { rerender } = render(<Flow onOverflowChange={overflow} />);
  const canvas = screen.getByRole("region", { name: "Workflow diagram" });
  expect(overflow).toHaveBeenCalledWith({ x: false, y: false });
  rerender(<Flow onOverflowChange={(value) => overflow(value)} />);
  expect(overflow).toHaveBeenCalledOnce();
  Object.defineProperties(canvas, {
    scrollWidth: { value: 500 },
    clientWidth: { value: 200 },
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
    releasePointerCapture: { value: vi.fn() },
  });
  act(() => observers.get(canvas)!());
  expect(overflow).toHaveBeenLastCalledWith({ x: true, y: false });
  expect(canvas).toHaveAttribute("tabindex", "0");
  const pointer = (type: string, x: number) =>
    fireEvent(
      canvas,
      Object.assign(
        new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }),
        { pointerId: 1, pointerType: "mouse" },
      ),
    );
  pointer("pointerdown", 100);
  pointer("pointermove", 40);
  expect(canvas.scrollLeft).toBe(60);
  pointer("pointerup", 40);
  pointer("pointermove", 20);
  expect(canvas.scrollLeft).toBe(60);
  expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
});
it("hands hover control to a combobox input that controls the list", async () => {
  const { container } = render(
    <>
      <input aria-label="Find" aria-controls="results" />
      <ListHighlight id="results" role="listbox">
        <div role="option" aria-selected="false">
          First
        </div>
        <div role="option" aria-selected="false">
          Second
        </div>
      </ListHighlight>
    </>,
  );
  const input = screen.getByRole("textbox", { name: "Find" });
  const list = screen.getByRole("listbox");
  const options = screen.getAllByRole("option");
  options.forEach((option, index) => {
    Object.defineProperties(option, {
      offsetTop: { value: index * 32 },
      offsetLeft: { value: 0 },
      offsetWidth: { value: 100 },
      offsetHeight: { value: 32 },
      offsetParent: { value: list },
    });
    option.getBoundingClientRect = () => ({
      x: 0,
      y: index * 32,
      left: 0,
      top: index * 32,
      right: 100,
      bottom: index * 32 + 32,
      width: 100,
      height: 32,
      toJSON() {},
    });
  });
  input.focus();
  fireEvent.mouseMove(list, { clientX: 10, clientY: 10 });
  await waitFor(() =>
    expect(options[0]).toHaveAttribute("data-ui-hover-active"),
  );
  fireEvent.keyDown(input, { key: "ArrowDown" });
  options[1].setAttribute("data-highlighted", "");
  await waitFor(() =>
    expect(options[1]).toHaveAttribute("data-ui-hover-active"),
  );
  expect(options[0]).not.toHaveAttribute("data-ui-hover-active");
  expect(container.querySelector(".ui-highlight")).toHaveStyle({
    transform: "translate(0px, 32px)",
  });
});
it("keeps portalled submenu pointer movement out of the parent list", async () => {
  render(
    <ListHighlight data-testid="parent-list" itemSelector="button">
      <button>Parent</button>
      {createPortal(
        <ListHighlight data-testid="child-list" itemSelector="button">
          <button>First child</button>
          <button>Second child</button>
        </ListHighlight>,
        document.body,
      )}
    </ListHighlight>,
  );
  const parent = screen.getByTestId("parent-list");
  const child = screen.getByTestId("child-list");
  [parent, child].forEach((list, column) => {
    list.querySelectorAll("button").forEach((button, row) => {
      Object.defineProperties(button, {
        offsetTop: { value: row * 32 },
        offsetLeft: { value: 0 },
        offsetWidth: { value: 100 },
        offsetHeight: { value: 32 },
        offsetParent: { value: list },
      });
      button.getBoundingClientRect = () => ({
        x: column * 110,
        y: row * 32,
        left: column * 110,
        top: row * 32,
        right: column * 110 + 100,
        bottom: row * 32 + 32,
        width: 100,
        height: 32,
        toJSON() {},
      });
    });
  });
  fireEvent.mouseMove(screen.getByRole("button", { name: "Second child" }), {
    clientX: 120,
    clientY: 45,
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Second child" }),
    ).toHaveAttribute("data-ui-hover-active"),
  );
  expect(screen.getByRole("button", { name: "Parent" })).not.toHaveAttribute(
    "data-ui-hover-active",
  );
  expect(parent.querySelector(".ui-highlight")).toHaveStyle({
    opacity: "0",
  });
});
