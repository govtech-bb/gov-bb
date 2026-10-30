import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  type LexicalEditor,
  type NodeKey,
} from "lexical";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { cn } from "../../cn";
import { blockHandle } from "../../ui/button";
import { shortcut } from "./shortcut";

// The rail beside a block, shared by the page and form editors. Each editor decides which block a pointer or the caret
// is on, where that block's first line is, and where a dragged block may land; the rail, its buttons, the drop line
// and the drag itself work the same in both.

/** The keys that open the caret's block menu, as the platform writes them. */
export const menuKey = shortcut(["mod", "/"]);

/** Where a block's rail sits, in its anchor's coordinates: `top` is the middle of the block's first line. */
export type RailPlace = { top: number; left: number };

export type RailTarget = RailPlace & {
  key: NodeKey;
  /** The rail follows the pointer, rather than the caret: it shows without being hovered itself. */
  pointed: boolean;
  /** The innermost node under the pointer, for settings that belong to part of the block. */
  context: NodeKey | null;
};

const sameTarget = (a: RailTarget | null, b: RailTarget | null) =>
  a?.key === b?.key &&
  a?.top === b?.top &&
  a?.left === b?.left &&
  a?.pointed === b?.pointed &&
  a?.context === b?.context;

/** The box of the first line of text drawn inside an element, or null where it has none on screen. */
function firstTextLine(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });

  const text = walker.nextNode();

  if (!text) return null;
  const range = document.createRange();
  range.selectNodeContents(text);

  // A line, not a visually hidden word
  return [...range.getClientRects()].find((rect) => rect.height >= 8) ?? null;
}

/**
 * Returns the first line's midpoint in anchor coordinates, including nested table or button text.
 * Uses line height for generated content such as a Details summary.
 */
export function firstLineMiddle(editor: LexicalEditor, anchor: HTMLElement, key: NodeKey) {
  const element = editor.getElementByKey(key);

  if (!element?.getClientRects().length) return null;
  const top = anchor.getBoundingClientRect().top;
  const drawn = getComputedStyle(element, "::before").content;
  const line = drawn === "none" || drawn === "normal" ? firstTextLine(element) : null;

  if (line) return { top: line.top + line.height / 2 - top, left: 0 };
  const style = getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  return {
    top:
      element.getBoundingClientRect().top -
      top +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.paddingTop) +
      lineHeight / 2,
    left: 0,
  };
}

type TargetRules = {
  /** The block at a point under the pointer (in the anchor's coordinates); undefined keeps the current one. */
  $blockAt: (element: Element, point: { x: number; y: number }) => NodeKey | null | undefined;
  $caretBlock: () => NodeKey | null;
  $place: (key: NodeKey) => RailPlace | null;
  /** Holds the rail on its block, as while the block's menu is open. */
  held?: boolean;
};

/**
 * The block whose rail shows: the one under the pointer, or else the caret's. `pin` puts the rail on a block as if the
 * pointer were there (opening its menu from the keyboard), and `release` lets the pointer and caret lead again.
 */
export function useRailTarget(anchor: HTMLElement, rules: TargetRules) {
  const [editor] = useLexicalComposerContext();
  const [target, setTarget] = useState<RailTarget | null>(null);
  const pointer = useRef<{ key: NodeKey; context: NodeKey | null } | null>(null);
  const caret = useRef<NodeKey | null>(null);
  const latest = useRef(rules);
  const { held = false } = rules;

  useEffect(() => {
    latest.current = rules;
  });

  const measure = useCallback(() => {
    const key = pointer.current?.key ?? caret.current;
    const place = key && editor.getEditorState().read(() => latest.current.$place(key), { editor });

    const next =
      key && place
        ? {
            key,
            ...place,
            pointed: !!pointer.current,
            context: pointer.current?.context ?? null,
          }
        : null;

    setTarget((previous) => (sameTarget(previous, next) ? previous : next));
  }, [editor]);

  useEffect(() => {
    if (held) return;

    // Pointer listeners were paused while held, so a leave event may have been missed.
    if (pointer.current && !anchor.matches(":hover")) {
      pointer.current = null;
      measure();
    }

    // Native drag sends pointercancel then pointerleave without actually leaving the block.
    let cancelled = false;

    const onCancel = () => {
      cancelled = true;
    };

    const onMove = (event: PointerEvent) => {
      cancelled = false;
      const element = event.target;

      // On the rail itself, the rail stays with its block
      if (!(element instanceof Element) || element.closest("[data-block-rail]")) return;
      const bounds = anchor.getBoundingClientRect();

      editor.getEditorState().read(
        () => {
          const key = latest.current.$blockAt(element, {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });

          if (key === undefined) return;

          if (key === null) {
            pointer.current = null;

            return;
          }

          // Crossing an ancestor's padding or the gutter on the way to the rail keeps the inner node as the settings' target
          const node = $getNearestNodeFromDOMNode(element);
          const previous = pointer.current?.context ? $getNodeByKey(pointer.current.context) : null;

          const kept =
            previous &&
            previous.isAttached() &&
            (node ? node.isParentOf(previous) : pointer.current?.key === key);

          const context = kept ? previous.getKey() : (node?.getKey() ?? null);

          pointer.current = { key, context };
        },
        { editor },
      );
      measure();
    };

    const onLeave = () => {
      if (cancelled) return;
      pointer.current = null;
      measure();
    };

    anchor.addEventListener("pointermove", onMove);
    anchor.addEventListener("pointercancel", onCancel);
    anchor.addEventListener("pointerleave", onLeave);

    return () => {
      anchor.removeEventListener("pointermove", onMove);
      anchor.removeEventListener("pointercancel", onCancel);
      anchor.removeEventListener("pointerleave", onLeave);
    };
  }, [anchor, editor, held, measure]);

  useEffect(() => {
    const update = () => {
      caret.current = editor.getEditorState().read(() => latest.current.$caretBlock(), { editor });
      measure();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    window.addEventListener("resize", measure);
    const unregister = editor.registerUpdateListener(update);
    update();

    return () => {
      unregister();
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchor, editor, measure]);

  const pin = useCallback(
    (key: NodeKey) => {
      pointer.current = { key, context: null };
      measure();
    },
    [measure],
  );

  const release = useCallback(() => {
    pointer.current = null;
    measure();
  }, [measure]);

  return { target, pin, release };
}

/**
 * The rail: the block's controls in the gutter, centred on its first line. It stays out of sight until the pointer is
 * on the block or keyboard focus reaches a control, always shows on touch screens, and gets out of the way of a drag.
 */
export function BlockRail({
  target,
  className,
  children,
}: {
  target: RailTarget;
  /** The rail's width and its gap to the text. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-block-rail=""
      className={cn(
        "absolute z-3 flex -translate-y-1/2 items-center justify-end gap-0.5 in-data-dragging:hidden pointer-coarse:opacity-100",
        !target.pointed && "opacity-0 focus-within:opacity-100 hover:opacity-100",
        className,
      )}
      style={{ top: target.top, left: target.left }}
    >
      {children}
    </div>
  );
}

/**
 * A control in the rail: an icon button. On a touch screen it's 44px tall, like the touchTarget, but 32px wide: the
 * form's 100px gutter holds three side by side, and the page's two, where 44px would push one off the page.
 */
export function RailButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(blockHandle, "w-6 shrink-0 pointer-coarse:h-11 pointer-coarse:w-8", className)}
    />
  );
}

/** The rail's drag grip, which also opens the block's menu: its pointer shows it can be picked up. */
export const railGrip = "cursor-grab active:cursor-grabbing [&>svg]:w-4.25";

/** Where a dragged block would land, in the anchor's coordinates. */
export type Line = { top: number; left: number; width: number };

export function DropLine({ line }: { line: Line | null }) {
  return (
    line && (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-4 h-0.75 rounded-full bg-focus forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none"
        style={line}
      />
    )
  );
}

type Point = { x: number; y: number };

type DragRules<At extends { line: Line }> = {
  /** The drag's data type: only this editor's blocks drop here. */
  type: string;
  /** Where the block would land at a point on screen, and the line that shows it; null where it can't. */
  $at: (key: NodeKey, point: Point) => At | null;
  $drop: (key: NodeKey, at: At) => void;
  /** After every drag, dropped or not, except a nudge that onNudge takes. */
  onEnd?: () => void;
  /** Treats a short, uncommitted drag as a click on the grip. */
  onNudge?: (key: NodeKey) => void;
};

/** Maximum distance in pixels for treating an uncommitted drag as a click. */
const NUDGE = 10;

type DragSession = { key: NodeKey; element: HTMLElement; from: Point; to: Point; strayed: boolean };

/**
 * Moves a block dragged by its rail's grip. While the drag lasts the anchor carries `data-dragging`, which hides the
 * rails, and the block carries `data-dragged`. Esc, a drop outside, or the editor turning read-only ends it.
 */
export function useBlockDrag<At extends { line: Line }>(anchor: HTMLElement, rules: DragRules<At>) {
  const [editor] = useLexicalComposerContext();
  const [hit, setHit] = useState<At | null>(null);
  const session = useRef<DragSession | null>(null);
  const point = useRef<Point | null>(null);
  const feedback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(rules);

  useEffect(() => {
    latest.current = rules;
  });

  // Only a native drag end can become a click; explicit cancellation must not open the menu.
  const finish = useCallback(
    (how: "dropped" | "ended" | "stopped" = "stopped") => {
      if (feedback.current !== null) clearTimeout(feedback.current);
      feedback.current = null;
      const ended = session.current;

      ended?.element.removeAttribute("data-dragged");
      anchor.removeAttribute("data-dragging");
      session.current = null;
      point.current = null;
      setHit(null);

      if (!ended) return;

      const nudged =
        how === "ended" &&
        !ended.strayed &&
        Math.hypot(ended.to.x - ended.from.x, ended.to.y - ended.from.y) < NUDGE;

      if (nudged && latest.current.onNudge) latest.current.onNudge(ended.key);
      else latest.current.onEnd?.();
    },
    [anchor],
  );

  useEffect(() => {
    const ours = (event: DragEvent) => !!event.dataTransfer?.types.includes(latest.current.type);

    const update = () => {
      const current = session.current;

      if (!current) return;

      if (
        !editor.isEditable() ||
        !editor.getEditorState().read(() => !!$getNodeByKey(current.key)?.isAttached(), { editor })
      ) {
        finish();

        return;
      }

      const position = point.current;

      if (!position) return;

      const next = editor
        .getEditorState()
        .read(() => latest.current.$at(current.key, position), { editor });

      setHit((previous) =>
        previous?.line.top === next?.line.top &&
        previous?.line.left === next?.line.left &&
        previous?.line.width === next?.line.width
          ? previous
          : next,
      );
    };

    const over = (event: DragEvent) => {
      if (!ours(event)) return;
      event.preventDefault();
      event.stopPropagation();

      if (!editor.isEditable() || !session.current) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";

        return;
      }

      point.current = { x: event.clientX, y: event.clientY };
      session.current.to = point.current;
      update();

      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };

    const drop = (event: DragEvent) => {
      if (!ours(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const current = session.current;
      let landed = false;

      if (
        editor.isEditable() &&
        current &&
        event.dataTransfer?.getData(latest.current.type) === current.key
      ) {
        current.to = { x: event.clientX, y: event.clientY };
        editor.update(
          () => {
            const at = latest.current.$at(current.key, current.to);

            if (!at) return;
            latest.current.$drop(current.key, at);
            landed = true;
          },
          { discrete: true },
        );
      }

      finish(landed ? "dropped" : "ended");
    };

    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !anchor.contains(event.relatedTarget)) {
        point.current = null;
        setHit(null);

        if (session.current) session.current.strayed = true;
      }
    };

    const endedByBrowser = () => finish("ended");

    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };

    anchor.addEventListener("dragover", over, true);
    anchor.addEventListener("drop", drop, true);
    anchor.addEventListener("dragleave", leave, true);
    document.addEventListener("dragend", endedByBrowser, true);
    document.addEventListener("keydown", cancel, true);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const unregisterUpdate = editor.registerUpdateListener(update);

    const unregisterEditable = editor.registerEditableListener((editable) => {
      if (!editable) finish();
    });

    return () => {
      finish();
      unregisterUpdate();
      unregisterEditable();
      anchor.removeEventListener("dragover", over, true);
      anchor.removeEventListener("drop", drop, true);
      anchor.removeEventListener("dragleave", leave, true);
      document.removeEventListener("dragend", endedByBrowser, true);
      document.removeEventListener("keydown", cancel, true);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, editor, finish]);

  const start = (event: ReactDragEvent<HTMLElement>, key: NodeKey) => {
    finish();
    const element = editor.getElementByKey(key);

    const attached = editor
      .getEditorState()
      .read(() => !!$getNodeByKey(key)?.isAttached(), { editor });

    if (!editor.isEditable() || !attached || !element?.getClientRects().length) {
      event.preventDefault();

      return;
    }

    const at = { x: event.clientX, y: event.clientY };
    session.current = { key, element, from: at, to: at, strayed: false };
    event.dataTransfer.setData(rules.type, key);
    event.dataTransfer.effectAllowed = "move";
    // Preserve the pointer's offset from the block in the drag image.
    const box = element.getBoundingClientRect();
    event.dataTransfer.setDragImage(element, event.clientX - box.left, event.clientY - box.top);
    // Once the browser has its full-opacity picture of the block: hiding the grip in dragstart itself would end the drag
    feedback.current = setTimeout(() => {
      if (session.current?.key !== key) return;
      element.setAttribute("data-dragged", "");
      anchor.setAttribute("data-dragging", "");
    });
  };

  return { line: hit?.line ?? null, start };
}
