/** @vitest-environment jsdom */
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Field } from "./field";
import { Textarea } from "./textarea";

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

const box = () => host.querySelector("textarea")!;

test("source is monospaced on the field's own white, never the grey of one that can't be changed", async () => {
  await render(
    <Field label="Markdown source">
      <Textarea variant="code" defaultValue="# Renew a passport" />
    </Field>,
  );

  expect(box().classList).toContain("font-mono");
  expect(box().classList).toContain("leading-6");
  expect([...box().classList].filter((name) => name.startsWith("bg-"))).toEqual(["bg-white"]);
  expect([...box().labels!].map((label) => label.textContent)).toEqual(["Markdown source"]);
});

test("growing with its words, the browser sizes it where it can", async () => {
  vi.stubGlobal("CSS", { supports: () => true });
  const ref = createRef<HTMLTextAreaElement>();

  await render(<Textarea autoGrow rows={1} defaultValue="/renew-a-passport" ref={ref} />);

  expect(box().className).toContain("supports-[field-sizing:content]:field-sizing-content");
  expect(box().classList).toContain("resize-none");
  // Left to the browser, it's never set by hand; the ref still reaches it
  expect(box().style.height).toBe("");
  expect(ref.current).toBe(box());
});

test("where the browser can't, it's measured as its words and its width change", async () => {
  vi.stubGlobal("CSS", { supports: () => false });
  let resized = () => {};

  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );

  let width = 300;
  let height = 40;

  Object.defineProperty(HTMLTextAreaElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => height,
  });

  await render(<Textarea autoGrow value="Short" onChange={() => {}} />);
  expect(box().style.height).toBe("40px");

  // A longer value from its owner
  height = 80;
  await render(<Textarea autoGrow value="A much longer description" onChange={() => {}} />);
  expect(box().style.height).toBe("80px");

  // Typed: the browser's input event
  height = 100;
  await act(async () => box().dispatchEvent(new Event("input", { bubbles: true })));
  expect(box().style.height).toBe("100px");

  // Narrowed, its words wrap onto more lines
  width = 200;
  height = 120;
  await act(async () => resized());
  expect(box().style.height).toBe("120px");

  Reflect.deleteProperty(HTMLTextAreaElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
});
