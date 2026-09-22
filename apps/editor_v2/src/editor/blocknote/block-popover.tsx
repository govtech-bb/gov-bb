/**
 * The block settings popover.
 *
 * Opened from "Edit" in a block's drag-handle menu, above "Delete". It holds
 * everything about a block that is not its text — which for a finder or a
 * calendar is the entire configuration.
 *
 * It is a dialog, not a div that happens to float: Escape closes it, focus
 * moves into it on open and returns to whatever opened it on close, and it
 * is labelled. A settings surface you can only reach and leave with a mouse
 * would fail the Barbados Service Standards, and this is the surface a
 * content designer spends the most time in.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Block, CollectionDefinition } from "@govtech-bb/block-kit";
import { BLOCK_LABELS } from "../new-block";
import { BlockSettings } from "./block-settings";

const MARGIN = 12;
const WIDTH = 520;

export function BlockPopover({
  block,
  anchor,
  collections,
  refKeys,
  onChange,
  onClose,
}: {
  block: Block;
  /** The element the popover points at — the block's node in the document. */
  anchor: HTMLElement | null;
  collections: CollectionDefinition[];
  refKeys: string[];
  onChange: (next: Block) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Anchor to the block, then keep it on screen. Measured in a layout effect
  // so it never paints in the wrong place first.
  useLayoutEffect(() => {
    const rect = anchor?.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 320;
    const top = rect
      ? Math.min(
          Math.max(MARGIN, rect.top),
          Math.max(MARGIN, window.innerHeight - height - MARGIN),
        )
      : MARGIN;
    const left = rect
      ? Math.min(rect.left, window.innerWidth - WIDTH - MARGIN)
      : MARGIN;
    setPosition({ top, left: Math.max(MARGIN, left) });
  }, [anchor, block.type]);

  // Focus the first control, so a keyboard user lands inside rather than
  // having to hunt for it.
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    first?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  // A click outside closes, the way every other popover does.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    // Deferred: the click that opened this must not immediately close it.
    const timer = setTimeout(
      () => document.addEventListener("pointerdown", onPointerDown),
      0,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panel}
      className="bn-popover"
      role="dialog"
      aria-label={`Edit ${BLOCK_LABELS[block.type]} block`}
      data-testid="block-popover"
      data-block-id={block.id}
      style={{ top: position.top, left: position.left, width: WIDTH }}
    >
      <header className="bn-popover-head">
        <h2 className="bn-popover-title">{BLOCK_LABELS[block.type]}</h2>
        <code className="bn-popover-id">{block.id}</code>
        <button
          type="button"
          className="bn-popover-close"
          data-testid="block-popover-close"
          onClick={onClose}
        >
          Done
        </button>
      </header>

      <div className="bn-popover-body">
        <BlockSettings
          block={block}
          onChange={onChange}
          collections={collections}
          refKeys={refKeys}
        />
      </div>
    </div>
  );
}
