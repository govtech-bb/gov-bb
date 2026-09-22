/**
 * The editing surface: one contenteditable holding the whole document.
 *
 * There is no preview pane. The blocks render as they render on the site —
 * prose is typed into directly, configuration blocks show their real output
 * — so the document on screen is the document, not a description of one
 * sitting next to a picture of it. That is the point of going Notion-like,
 * and it removes the split-brain failure where the two halves disagree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core";
import type { Block, BlockType, Ref } from "@govtech-bb/block-kit";
import { newId } from "../new-block";
import {
  DocumentMemo,
  fromBlockNote,
  isConfigType,
  toBlockNote,
  type BnBlock,
} from "./adapter";
import { BlockControls, collectionOf } from "./block-controls";
import { BlockPopover } from "./block-popover";
import { Modal } from "../modal";
import { RecordTable } from "../record-table";
import { BlockSideMenu } from "./block-menu";
import { useEditorBlockContext } from "./context";
import { editorSchema } from "./schema";
import {
  SlashMenu,
  blockNoteInsertFor,
  paletteItems,
  type PaletteItem,
} from "./slash-menu";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

export function DocumentEditor({
  blocks,
  refs,
  onChange,
  onRequestSave,
}: {
  blocks: Block[];
  refs: Record<string, Ref>;
  /** Refs come back too: a link typed in the editor mints one. */
  onChange: (blocks: Block[], refs: Record<string, Ref>) => void;
  onRequestSave: () => void;
}) {
  // One memo per mounted document. It carries the list container ids and
  // heading anchors BlockNote's model has nowhere to store.
  const memo = useRef(new DocumentMemo());
  const { collections, refKeys } = useEditorBlockContext();

  /** The block whose settings popover is open, if any. */
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * The block the pointer is over. BlockNote's side-menu renderer receives
   * no block, so the hover that reveals the drag handle is what records
   * which block the menu belongs to.
   */
  const hoveredId = useRef<string | null>(null);

  /** The hovered block, as state, so the control strip can follow it. */
  const [hovered, setHovered] = useState<{
    id: string;
    element: HTMLElement;
  } | null>(null);

  /** The block whose collection records are open in a modal. */
  const [dataBlockId, setDataBlockId] = useState<string | null>(null);

  const initialContent = useMemo(
    () => toBlockNote(blocks, memo.current, refs),
    // Deliberately once: after mount the editor owns the document, and
    // re-seeding it from props would fight the user's cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent:
      initialContent.length > 0 ? (initialContent as never) : undefined,
  });

  const refsRef = useRef(refs);
  refsRef.current = refs;

  const serialize = useCallback(() => {
    const document = editor.document as unknown as BnBlock[];
    const next = fromBlockNote(
      document,
      memo.current,
      () => newId(),
      refsRef.current,
    );
    onChange(next.blocks, next.refs);
  }, [editor, onChange]);

  const insert = useCallback(
    (type: BlockType) => {
      const target = editor.getTextCursorPosition().block;
      editor.insertBlocks([blockNoteInsertFor(type) as never], target, "after");
    },
    [editor],
  );

  const items = useMemo(() => paletteItems(insert), [insert]);

  /**
   * Apply a settings change from the popover.
   *
   * Three destinations, because three kinds of thing live in three places: a
   * heading's anchor is in the memo (BlockNote's heading has no prop for
   * it), a notice's variant and a config block's payload are BlockNote
   * props. Only the memo case needs an explicit re-serialize — the other two
   * go through `updateBlock`, which fires `onChange` itself.
   */
  const applyBlockChange = useCallback(
    (id: string, next: Block) => {
      if (next.type === "heading") {
        memo.current.rememberAnchor(id, next.anchor);
        editor.updateBlock(id, { props: { level: next.level } });
      } else if (next.type === "notice") {
        editor.updateBlock(id, { props: { variant: next.variant } });
      } else if (isConfigType(next.type)) {
        const { id: _id, ...rest } = next as unknown as Record<
          string,
          unknown
        > & { id: string };
        editor.updateBlock(id, { props: { config: JSON.stringify(rest) } });
      }
      serialize();
    },
    [editor, serialize],
  );

  const editing = editingId
    ? (blocks.find((block) => block.id === editingId) ?? null)
    : null;

  const hoveredBlock = hovered
    ? (blocks.find((block) => block.id === hovered.id) ?? null)
    : null;

  const dataBlock = dataBlockId
    ? (blocks.find((block) => block.id === dataBlockId) ?? null)
    : null;
  const dataCollection =
    collections.find((entry) => entry.key === collectionOf(dataBlock, refs)) ??
    null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      // Ctrl/Cmd+S flushes the debounce. preventDefault matters: without it
      // the browser's own Save dialog opens over the editor.
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        onRequestSave();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onRequestSave]);

  return (
    <div
      className="bn-surface bk-scope"
      data-testid="editor-surface"
      onPointerOver={(event) => {
        const node = (event.target as HTMLElement).closest?.(
          "[data-id]",
        ) as HTMLElement | null;
        const id = node?.getAttribute("data-id");
        if (!id || !node) return;
        hoveredId.current = id;
        setHovered((current) =>
          current?.id === id ? current : { id, element: node },
        );
      }}
    >
      <BlockNoteView
        editor={editor}
        // Both replaced below: the palette is closed, and the block menu
        // carries Edit above Delete. Leaving the defaults mounted renders a
        // second side menu on top of ours.
        slashMenu={false}
        sideMenu={false}
        onChange={serialize}
        theme="light"
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(items as never, query) as never
          }
          suggestionMenuComponent={SlashMenu as never}
        />
        <BlockSideMenu onEdit={() => setEditingId(hoveredId.current)} />
      </BlockNoteView>

      {hoveredBlock ? (
        <BlockControls
          block={hoveredBlock}
          refs={refs}
          element={hovered?.element ?? null}
          onEditData={() => setDataBlockId(hoveredBlock.id)}
          onSettings={() => setEditingId(hoveredBlock.id)}
          onDelete={() => {
            editor.removeBlocks([hoveredBlock.id]);
            setHovered(null);
            serialize();
          }}
        />
      ) : null}

      {dataCollection ? (
        <Modal
          wide
          title={dataCollection.title}
          description="Editing these records changes every page that reads them. Filtering options and column headings are behind the cog."
          onClose={() => setDataBlockId(null)}
        >
          <RecordTable collection={dataCollection} />
        </Modal>
      ) : null}

      {editing ? (
        <BlockPopover
          block={editing}
          anchor={document.querySelector<HTMLElement>(
            `[data-id="${editing.id}"]`,
          )}
          collections={collections}
          refKeys={refKeys}
          onChange={(next) => applyBlockChange(editing.id, next)}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  );
}

export type { PaletteItem };
