/**
 * The slash menu — the closed palette, made visible.
 *
 * BlockNote's own menu is replaced for two reasons. It offers block types
 * this document model has no home for, and its default markup is a div that
 * responds to a pointer. This is a service under the Barbados Service
 * Standards, so the menu is a real `listbox` with `option` children, a
 * roving `aria-activedescendant`, and keyboard selection that works without
 * a mouse anywhere near it.
 */

import type { BlockType } from "@govtech-bb/block-kit";
import { BLOCK_LABELS, INSERTABLE, createBlock } from "../new-block";

export interface PaletteItem {
  /** BlockNote's SuggestionMenuController matches on this. */
  title: string;
  blockType: BlockType;
  hint: string;
  onItemClick: () => void;
}

const HINTS: Record<BlockType, string> = {
  paragraph: "Body text",
  heading: "Section heading",
  list: "Bulleted list",
  notice: "Information or warning callout",
  start_link: "The GOV.BB start button",
  finder: "A searchable, filterable list over a collection",
  calendar: "Dates computed from editable rules",
  data_table: "A table over a collection query",
  image_placeholder: "A grey box standing in for an image",
};

/** What BlockNote should insert for each of our nine types. */
export function blockNoteInsertFor(type: BlockType): {
  type: string;
  props?: Record<string, string | number | boolean>;
} {
  switch (type) {
    case "paragraph":
      return { type: "paragraph" };
    case "heading":
      return { type: "heading", props: { level: 2 } };
    case "list":
      return { type: "bulletListItem" };
    case "notice":
      return { type: "notice", props: { variant: "info" } };
    default: {
      // A fresh configuration block starts from the same defaults the
      // palette has always used; only its id is dropped, because BlockNote
      // assigns that.
      const { id: _id, ...rest } = createBlock(type) as unknown as Record<
        string,
        unknown
      > & { id: string };
      return { type, props: { config: JSON.stringify(rest) } };
    }
  }
}

export function paletteItems(insert: (type: BlockType) => void): PaletteItem[] {
  return INSERTABLE.map((type) => ({
    title: BLOCK_LABELS[type],
    blockType: type,
    hint: HINTS[type],
    onItemClick: () => insert(type),
  }));
}

export function SlashMenu({
  items,
  selectedIndex,
  onItemClick,
}: {
  items: PaletteItem[];
  selectedIndex?: number;
  onItemClick?: (item: PaletteItem) => void;
}) {
  const active = selectedIndex ?? 0;
  const activeId = items[active]
    ? `slash-item-${items[active].blockType}`
    : undefined;

  return (
    <ul
      className="bn-slash"
      role="listbox"
      aria-label="Insert a block"
      aria-activedescendant={activeId}
      data-testid="slash-menu"
    >
      {items.map((item, index) => (
        <li
          key={item.blockType}
          id={`slash-item-${item.blockType}`}
          role="option"
          aria-selected={index === active}
          className={`bn-slash-item${index === active ? " bn-slash-item-active" : ""}`}
          data-testid={`slash-item-${item.blockType}`}
          onClick={() => onItemClick?.(item)}
        >
          <span className="bn-slash-title">{item.title}</span>
          <span className="bn-slash-hint">{item.hint}</span>
        </li>
      ))}
    </ul>
  );
}
