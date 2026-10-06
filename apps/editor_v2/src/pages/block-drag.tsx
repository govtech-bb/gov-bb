import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  $getNodeByKey,
  $getRoot,
  $isRootNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { PageMetadataNode } from "./metadata";

const DRAG_TYPE = "application/x-page-block";

type Hit = {
  key: string;
  before: boolean;
  line: { top: number; left: number; width: number };
};

function $isContentBlock(node: LexicalNode | null): node is LexicalNode {
  return (
    !!node?.isAttached() && $isRootNode(node.getParent()) && !(node instanceof PageMetadataNode)
  );
}

function $canDrop(source: LexicalNode | null, target: LexicalNode | null, before: boolean) {
  return (
    $isContentBlock(source) &&
    $isContentBlock(target) &&
    !source.is(target) &&
    !(before ? source.getNextSibling()?.is(target) : source.getPreviousSibling()?.is(target))
  );
}

function $hitAt(
  editor: LexicalEditor,
  anchor: HTMLElement,
  sourceKey: string,
  point: { x: number; y: number },
): Hit | null {
  const bounds = anchor.getBoundingClientRect();
  const body = editor.getRootElement()?.getBoundingClientRect();

  if (
    !body ||
    point.x < bounds.left ||
    point.x > bounds.right ||
    point.y < bounds.top ||
    point.y > bounds.bottom
  )
    return null;

  const blocks = $getRoot()
    .getChildren()
    .filter($isContentBlock)
    .flatMap((node) => {
      const element = editor.getElementByKey(node.getKey());

      return element?.getClientRects().length
        ? [{ node, bounds: element.getBoundingClientRect() }]
        : [];
    });

  const index = blocks.findIndex((block) => point.y < (block.bounds.top + block.bounds.bottom) / 2);
  const before = index !== -1;
  const target = before ? blocks[index] : blocks.at(-1);

  if (!target || !$canDrop($getNodeByKey(sourceKey), target.node, before)) return null;

  const previous = before ? blocks[index - 1] : null;

  const y = before
    ? previous
      ? (previous.bounds.bottom + target.bounds.top) / 2
      : target.bounds.top
    : target.bounds.bottom + 8;

  return {
    key: target.node.getKey(),
    before,
    line: { top: y - bounds.top - 1.5, left: body.left - bounds.left, width: body.width },
  };
}

export function usePageBlockDrag(anchor: HTMLElement) {
  const [editor] = useLexicalComposerContext();
  const [hit, setHit] = useState<Hit | null>(null);
  const session = useRef<{ key: string; element: HTMLElement } | null>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
    session.current?.element.removeAttribute("data-page-dragging");
    session.current = null;
    point.current = null;
    setHit(null);
  }, []);

  useEffect(() => {
    const ours = (event: DragEvent) => event.dataTransfer?.types.includes(DRAG_TYPE);

    const updateHit = () => {
      const current = session.current;
      const position = point.current;

      if (!current) return;

      const valid =
        editor.isEditable() &&
        editor.getEditorState().read(() => $isContentBlock($getNodeByKey(current.key)), { editor });

      if (!valid) {
        finish();

        return;
      }

      if (!position) return;

      const next = editor
        .getEditorState()
        .read(() => $hitAt(editor, anchor, current.key, position), { editor });

      setHit((previous) =>
        previous?.key === next?.key &&
        previous?.before === next?.before &&
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
      updateHit();

      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };

    const drop = (event: DragEvent) => {
      if (!ours(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const current = session.current;

      if (
        editor.isEditable() &&
        current &&
        event.dataTransfer?.getData(DRAG_TYPE) === current.key
      ) {
        editor.update(
          () => {
            const destination = $hitAt(editor, anchor, current.key, {
              x: event.clientX,
              y: event.clientY,
            });

            if (!destination) return;
            const source = $getNodeByKey(current.key);
            const target = $getNodeByKey(destination.key);

            if (!source || !target || !$canDrop(source, target, destination.before)) return;
            $addUpdateTag(HISTORY_PUSH_TAG);

            if (destination.before) target.insertBefore(source);
            else target.insertAfter(source);
          },
          { discrete: true },
        );
      }

      finish();
    };

    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !anchor.contains(event.relatedTarget)) {
        point.current = null;
        setHit(null);
      }
    };

    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };

    anchor.addEventListener("dragover", over, true);
    anchor.addEventListener("drop", drop, true);
    anchor.addEventListener("dragleave", leave, true);
    document.addEventListener("dragend", finish, true);
    document.addEventListener("keydown", cancel, true);
    window.addEventListener("scroll", updateHit, true);
    window.addEventListener("resize", updateHit);

    const unregisterUpdate = editor.registerUpdateListener(updateHit);

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
      document.removeEventListener("dragend", finish, true);
      document.removeEventListener("keydown", cancel, true);
      window.removeEventListener("scroll", updateHit, true);
      window.removeEventListener("resize", updateHit);
    };
  }, [anchor, editor, finish]);

  const start = (event: ReactDragEvent<HTMLButtonElement>, key: string) => {
    finish();
    const element = editor.getElementByKey(key);

    const valid = editor
      .getEditorState()
      .read(() => $isContentBlock($getNodeByKey(key)), { editor });

    if (!editor.isEditable() || !valid || !element?.getClientRects().length) {
      event.preventDefault();

      return;
    }

    session.current = { key, element };
    event.dataTransfer.setData(DRAG_TYPE, key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setDragImage(element, 0, 0);
    // Let the browser capture the full-opacity preview before dimming its source.
    feedbackTimer.current = setTimeout(() => {
      if (session.current?.key === key) element.setAttribute("data-page-dragging", "");
    });
  };

  return { hit, start, finish };
}
