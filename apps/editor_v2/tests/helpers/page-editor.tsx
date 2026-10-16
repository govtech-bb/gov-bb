import { afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type LexicalEditor } from "lexical";
import { EditorComposer } from "../../src/editor/react/composer";
import { PageEditor } from "../../src/pages/editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

let root: Root;

let host: HTMLDivElement;

let editor: LexicalEditor;

function CaptureEditor() {
  [editor] = useLexicalComposerContext();

  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = document.createElement("div").style;
    style.cssText = computedStyle(element).cssText;
    style.fontSize ||= "16px";
    style.lineHeight ||= "24px";
    style.paddingTop ||= "0px";
    style.borderTopWidth ||= "0px";

    return style;
  });
  const rect = new DOMRect(0, 0, 600, 40);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(
    Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) }),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Mount a real page editor in a jsdom test; the registered hooks clean it up. */
export async function renderPageEditor(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode !== "visual") throw new Error("Expected visual page fixture");
  await act(async () => {
    root.render(
      <EditorComposer definition={govbbPageEditor} initialState={prepared.state}>
        <CaptureEditor />
        <PageEditor />
      </EditorComposer>,
    );
  });

  return editor;
}

/** Find page controls, including menus rendered outside the editor in portals. */
export function pageControl<T extends Element = HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);

  if (!result) throw new Error(`Missing page control: ${selector}`);

  return result;
}

/** Place the page caret without moving the pointer or changing the hover target. */
export async function selectPageText(value: string) {
  await act(async () => {
    editor.update(
      () => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === value);

        if (!text) throw new Error(`Missing page text: ${value}`);
        text.selectEnd();
      },
      { discrete: true },
    );
  });
}

/** Open the page hover menu across ancestor padding without clicking the content. */
export async function hoverPageMenu(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
  });
  await act(async () => {
    target.closest("li")?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    target
      .closest(".page-editable > ol, .page-editable > ul")
      ?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    pageControl(".page-block-rail").dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    pageControl<HTMLButtonElement>('[aria-label="Block options"]').click();
  });
}
