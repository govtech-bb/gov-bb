/**
 * The editing surface: one contenteditable holding the whole document.
 *
 * There is no preview pane. The blocks render as they render on the site —
 * prose is typed into directly, configuration blocks show their real output
 * — so the document on screen is the document, not a description of one
 * sitting next to a picture of it. That is the point of going Notion-like,
 * and it removes the split-brain failure where the two halves disagree.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core";
import type { Block, BlockType } from "@govtech-bb/block-kit";
import { newId } from "../new-block";
import {
  DocumentMemo,
  fromBlockNote,
  toBlockNote,
  type BnBlock,
} from "./adapter";
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
  onChange,
  onRequestSave,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  onRequestSave: () => void;
}) {
  // One memo per mounted document. It carries the list container ids and
  // heading anchors BlockNote's model has nowhere to store.
  const memo = useRef(new DocumentMemo());

  const initialContent = useMemo(
    () => toBlockNote(blocks, memo.current),
    // Deliberately once: after mount the editor owns the document, and
    // re-seeding it from props would fight the user's cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: initialContent.length > 0 ? initialContent : undefined,
  });

  const serialize = useCallback(() => {
    const document = editor.document as unknown as BnBlock[];
    onChange(fromBlockNote(document, memo.current, () => newId()));
  }, [editor, onChange]);

  const insert = useCallback(
    (type: BlockType) => {
      const target = editor.getTextCursorPosition().block;
      editor.insertBlocks([blockNoteInsertFor(type) as never], target, "after");
    },
    [editor],
  );

  const items = useMemo(() => paletteItems(insert), [insert]);

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
    <div className="bn-surface" data-testid="editor-surface">
      <BlockNoteView
        editor={editor}
        slashMenu={false}
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
      </BlockNoteView>
    </div>
  );
}

export type { PaletteItem };
