/**
 * Per-block controls, at the right edge of whichever block the pointer is
 * over.
 *
 * They used to live inside the drag handle's menu, which meant two clicks
 * and a guess to reach Edit — the handle gives no hint that it holds
 * anything. Putting them in the margin makes them visible the moment they
 * are relevant.
 *
 * The strip is positioned rather than rendered inside each block, because
 * `paragraph`, `heading` and the list items are BlockNote's own components
 * and there is nowhere inside them to put anything.
 *
 * A data-backed block gets three controls, and the order says which one an
 * author reaches for most: the **pencil** opens the collection's records —
 * the polyclinic phone numbers, the holiday rules — and the **cog** opens
 * the block's own configuration, the facets and the column headings.
 * Editing the data is the common task; changing how it is presented is not.
 */

import type { Block, Ref } from "@govtech-bb/block-kit";
import { useLayoutEffect, useState } from "react";
import { blockHasSettings } from "./block-settings";

/**
 * The collection a block's content comes from, or null for a block whose
 * content is words.
 *
 * A finder and a calendar name their collection directly. A `data_table` does
 * not — it names a ref, and the ref names the collection — which is why it
 * needs the document's refs to answer this at all. Missing that indirection
 * is what left a data_table with no way to reach its records.
 *
 * A `contact` block is deliberately NOT here, though it reads from a
 * collection too. The question this answers is "does the block LIST a
 * collection", not "does it read one": a finder, a calendar and a data_table
 * put many records on the page, so editing those records is the obvious
 * thing to want. A contact block shows one record, chosen in its own
 * settings, so Edit belongs to the block — its heading, its description, and
 * which organisation it names. The ministry's own details are still editable
 * through the collection, from a block that lists it.
 */
export function collectionOf(
  block: Block | null,
  refs: Record<string, Ref> = {},
): string | null {
  if (!block) return null;
  if (block.type === "finder" || block.type === "calendar") {
    return block.collection;
  }
  if (block.type === "data_table") {
    const ref = refs[block.source];
    if (ref && (ref.kind === "query" || ref.kind === "record")) {
      return ref.collection;
    }
  }
  return null;
}

export function BlockControls({
  block,
  refs,
  element,
  onEditData,
  onSettings,
  onDelete,
}: {
  block: Block;
  refs: Record<string, Ref>;
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

  const collection = collectionOf(block, refs);
  const hasSettings = blockHasSettings(block);

  return (
    <div
      className="bn-controls"
      style={{ top: box.top, left: box.left }}
      data-testid={`block-controls-${block.id}`}
      contentEditable={false}
    >
      {collection ? (
        <IconButton
          testId={`block-edit-data-${block.id}`}
          label={`Edit the ${collection} records`}
          onClick={onEditData}
        >
          <PencilIcon />
        </IconButton>
      ) : hasSettings ? (
        <IconButton
          testId={`block-edit-${block.id}`}
          label="Edit this block"
          onClick={onSettings}
        >
          <PencilIcon />
        </IconButton>
      ) : null}

      {collection && hasSettings ? (
        <IconButton
          testId={`block-settings-${block.id}`}
          label="Block settings"
          onClick={onSettings}
        >
          <CogIcon />
        </IconButton>
      ) : null}

      <IconButton
        testId={`block-delete-${block.id}`}
        label="Delete this block"
        danger
        onClick={onDelete}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}

/**
 * An icon-only control.
 *
 * `aria-label` and `title` carry the same words: the label is what a screen
 * reader announces and the title is what everyone else gets on hover. An
 * icon button without both is a button nobody can identify.
 */
function IconButton({
  testId,
  label,
  danger,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`bn-control${danger ? " bn-control-danger" : ""}`}
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The icons are decorative: every button carries its own aria-label, so the
 * SVG must not be announced separately. `role="presentation"` alongside
 * `aria-hidden` says so to both assistive tech and the linter, which would
 * otherwise ask for a <title> that would be read out twice.
 */
const iconProps = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  role: "presentation",
  "aria-hidden": true,
  focusable: false,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.62.77 1.03 1.42 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
