import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  UNDO_COMMAND,
  REDO_COMMAND,
  mergeRegister,
} from "lexical";
import { ArrowCounterClockwise, ArrowClockwise } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { historyAvailable } from "../core/history";
import { Button } from "../../ui/button";
import { Tip } from "../../ui/tooltip";

/**
 * Undo and redo for the editor around them, a page's or a form's: each is unavailable while there's nothing to take
 * back or bring back. Keep it mounted while its document is hidden: the history only says what's available as it
 * changes.
 */
export function UndoRedo() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  // A history carried on from the document's last editor may already have steps
  const [canUndo, setCanUndo] = useState(() => historyAvailable(editor).undo);
  const [canRedo, setCanRedo] = useState(() => historyAvailable(editor).redo);
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (value) => {
            setCanUndo(value);

            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (value) => {
            setCanRedo(value);

            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );

  return (
    <div className="flex items-center gap-1">
      <Tip content="Undo">
        <Button
          aria-label="Undo"
          icon={<ArrowCounterClockwise />}
          disabled={!editable || !canUndo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        />
      </Tip>
      <Tip content="Redo">
        <Button
          aria-label="Redo"
          icon={<ArrowClockwise />}
          disabled={!editable || !canRedo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        />
      </Tip>
    </div>
  );
}
