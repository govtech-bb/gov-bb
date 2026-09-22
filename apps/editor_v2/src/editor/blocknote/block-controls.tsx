/**
 * Per-block controls, at the right edge of whichever block the pointer is
 * over.
 *
 * They used to live inside the drag handle's menu, which meant two clicks
 * and a guess to reach Edit — the handle gives no hint that it holds
 * anything. Putting them in the margin makes them visible the moment they
 * are relevant, which is the whole reason Notion's controls appear on hover
 * rather than living in a panel.
 *
 * The strip is positioned rather than rendered inside each block, because
 * `paragraph`, `heading` and the list items are BlockNote's own components
 * and there is nowhere inside them to put anything.
 *
 * A data-backed block gets three controls, and the order says which one an
 * author reaches for most: **Edit** opens the collection's records — the
 * polyclinic phone numbers, the holiday rules — and the **cog** opens the
 * block's own configuration, the facets and the column headings. Editing the
 * data is the common task; changing how it is filtered is not.
 */

import type { Block } from "@govtech-bb/block-kit";
import { useLayoutEffect, useState } from "react";
import { blockHasSettings } from "./block-settings";

/** Blocks whose content is a collection rather than words. */
export function collectionOf(block: Block | null): string | null {
  if (!block) return null;
  if (block.type === "finder" || block.type === "calendar") {
    return block.collection;
  }
  return null;
}

export function BlockControls({
  block,
  element,
  onEditData,
  onSettings,
  onDelete,
}: {
  block: Block;
  /** The hovered block's node, which the strip aligns to. */
  element: HTMLElement | null;
  onEditData: () => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!element) return setBox(null);
    const rect = element.getBoundingClientRect();
    setBox({ top: rect.top + 4, left: rect.right + 8 });
  }, [element, block.id]);

  if (!box) return null;

  const collection = collectionOf(block);
  const hasSettings = blockHasSettings(block);

  return (
    <div
      className="bn-controls"
      style={{ top: box.top, left: box.left }}
      data-testid={`block-controls-${block.id}`}
      contentEditable={false}
    >
      {collection ? (
        <button
          type="button"
          className="bn-control"
          data-testid={`block-edit-data-${block.id}`}
          title={`Edit the ${collection} records`}
          onClick={onEditData}
        >
          Edit
        </button>
      ) : hasSettings ? (
        <button
          type="button"
          className="bn-control"
          data-testid={`block-edit-${block.id}`}
          title="Edit this block"
          onClick={onSettings}
        >
          Edit
        </button>
      ) : null}

      {collection && hasSettings ? (
        <button
          type="button"
          className="bn-control bn-control-icon"
          data-testid={`block-settings-${block.id}`}
          aria-label="Block settings"
          title="Filtering options and column headings"
          onClick={onSettings}
        >
          <CogIcon />
        </button>
      ) : null}

      <button
        type="button"
        className="bn-control bn-control-danger"
        data-testid={`block-delete-${block.id}`}
        title="Delete this block"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

function CogIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.62.77 1.03 1.42 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
