import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $isElementNode,
  $setSelection,
  type LexicalEditor,
} from "lexical";
import Selecto from "selecto";
import { $formBlocks, $isPageHead } from "../nodes";
import { $selectedBlocks, $selectNodes } from "./blocks";
import { blockSelectionState } from "./selection-state";

export type Device = {
  matchMedia(query: string): { matches: boolean };
  navigator: { maxTouchPoints: number; userAgent: string };
  screen: { width: number; height: number };
};

/** Touch-primary devices leave margin gestures to scrolling; Windows hybrids retain mouse selection. */
export function touchFirst(device: Device = window) {
  const media = (query: string) => device.matchMedia(query).matches;
  const { maxTouchPoints, userAgent } = device.navigator;
  const touchEvents = "ontouchstart" in device;

  const touch =
    maxTouchPoints > 0 || touchEvents || ("TouchEvent" in device && media("(any-pointer: coarse)"));

  const coarse =
    (media("(pointer: coarse)") || (!media("(pointer: fine)") && touchEvents)) &&
    !/Windows.*Firefox/.test(userAgent);

  const ipad =
    media("(pointer: coarse)") &&
    /iPad|Macintosh/.test(userAgent) &&
    Math.min(device.screen.width, device.screen.height) >= 768;

  const fine = media("(any-pointer: fine)") || media("(any-hover: hover)") || ipad || !touchEvents;

  return touch && coarse && (!fine || !/Windows/.test(userAgent));
}

/**
 * Dragging from the gutter or block margins selects every block touched, with Shift toggling the selection.
 * Ending beside the starting block places the caret at its end instead.
 */
export function rubberBand(editor: LexicalEditor) {
  const selectionState = blockSelectionState(editor);

  return editor.registerRootListener((root) => {
    const builder = root?.closest<HTMLElement>(".form-builder-container");

    if (!root || !builder || touchFirst()) return;
    // The editor's own space: its margins
    const margin = (target: Element) => target === root;

    // Controls and open menus own their gestures. Closed, inert panels do not block selection.
    const starts = (target: Element) =>
      (margin(target) || !root.contains(target)) &&
      !target.closest("button, a, input, textarea, select") &&
      !document.querySelector(
        "[role=menu]:not([inert]), [role=dialog]:not([inert]), #typeahead-menu, .form-context-menu-overlay",
      );

    // Include the block's margins when finding the row under a pointer within the editor width.
    const rowAt = ({ clientX: x, clientY: y }: { clientX: number; clientY: number }) => {
      const { left, right } = root.getBoundingClientRect();

      if (x < left || x >= right) return;

      return [...root.children].find((el) => {
        if (!el.getClientRects().length) return false;
        const { top, bottom } = el.getBoundingClientRect();
        const style = getComputedStyle(el);

        return (
          top - parseFloat(style.marginTop) <= y && y < bottom + parseFloat(style.marginBottom)
        );
      });
    };

    const selecto = new Selecto({
      container: builder, // the box takes the form's accent
      dragContainer: builder,
      selectableTargets: [
        () =>
          editor
            .read(() =>
              $formBlocks()
                .slice(1)
                .filter((block) => !$isPageHead(block))
                .flatMap((block) => editor.getElementByKey(block.getKey()) ?? []),
            )
            .filter((el) => el.getClientRects().length > 0),
      ],
      scrollOptions: {
        container: document.body,
        throttleTime: 30,
        threshold: 100,
        getScrollPosition: () => [
          document.documentElement.scrollLeft,
          document.documentElement.scrollTop,
        ],
      },
      hitRate: 0,
      selectFromInside: false,
      selectByClick: false,
      checkInput: false, // The editor's contenteditable margins must remain draggable; starts() excludes inputs.
      toggleContinueSelect: ["shift"],
      // Prevent the final click from collapsing the block selection to a caret.
      preventClickEventOnDrag: true,
      className: "border! border-focus! bg-focus/20!",
    });

    let row: Element | undefined;
    selecto.on("dragStart", (e) => {
      const target = e.inputEvent.target;

      if (!(target instanceof Element) || !starts(target)) return e.stop();
      row = target === root ? rowAt(e) : undefined;
      // Seed Selecto from keyboard selection so Shift-drag extends the current selection.
      selecto.setSelectedTargets(
        editor.read(() =>
          $selectedBlocks().flatMap((block) => editor.getElementByKey(block.getKey()) ?? []),
        ),
      );
    });
    selecto.on("select", ({ added, removed }) => {
      selectionState.toggled = null; // Restart the Shift+↑/↓ toggle sequence after a pointer selection.
      editor.update(() => {
        const keys = new Set($selectedBlocks().map((block) => block.getKey()));
        const keyOf = (el: Element) => $getNearestNodeFromDOMNode(el)?.getKey() ?? "";

        for (const el of added) keys.add(keyOf(el));

        for (const el of removed) keys.delete(keyOf(el));
        $selectNodes([...keys].flatMap((key) => $getNodeByKey(key) ?? []));
      });
    });
    selecto.on("scroll", ({ direction: [x = 0, y = 0] }) =>
      document.documentElement.scrollBy(50 * x, 50 * y),
    );
    selecto.on("dragEnd", (e) => {
      // A gesture confined to one block's margin enters text editing or clears selection for a widget.
      if (row && row === rowAt(e)) {
        const node = editor.read(() => $getNearestNodeFromDOMNode(row!));

        if ($isElementNode(node)) root.focus({ preventScroll: true });

        return editor.update(() => ($isElementNode(node) ? node.selectEnd() : $setSelection(null)));
      }

      // Restore keyboard focus without replacing the block selection with a text caret.
      if (!e.isDrag || !editor.read(() => $selectedBlocks().length)) return;
      root.focus({ preventScroll: true });
      getSelection()?.removeAllRanges();
    });

    // Intercept margin gestures before Selecto and Lexical: Gesto rejects drags in a focused editor,
    // while Lexical would turn a root pointerdown into a text caret and replace the block selection.
    const fromMargin = (e: MouseEvent) =>
      e.button === 0 && e.target instanceof Element && margin(e.target) && starts(e.target);

    const onPointerDown = (e: PointerEvent) => fromMargin(e) && e.stopPropagation();

    const onMouseDown = (e: MouseEvent) => {
      if (!fromMargin(e)) return;
      e.preventDefault();
      root.blur();
    };

    builder.addEventListener("pointerdown", onPointerDown, true);
    builder.addEventListener("mousedown", onMouseDown, true);

    return () => {
      builder.removeEventListener("pointerdown", onPointerDown, true);
      builder.removeEventListener("mousedown", onMouseDown, true);
      selecto.destroy();
    };
  });
}
