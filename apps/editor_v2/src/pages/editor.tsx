import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
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
import { useEffect, useId, useState } from "react";
import { EditorSlot } from "../editor/react/contributions";
import { Button } from "../ui/button";
import { Tip } from "../ui/tooltip";
import { PageBlockControls } from "./block-controls";
import { PageSlashMenu } from "./slash-menu";
import "./page.css";

export function PageHistoryControls() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
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
    <div className="page-history-controls">
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

export function PageEditor({ label = "Page content" }: { label?: string }) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const hintId = useId();

  return (
    <div className="page-editor" ref={setAnchor}>
      <ContentEditable
        aria-label={label}
        aria-describedby={hintId}
        className="page-body page-editable"
      />
      {anchor && <PageBlockControls anchor={anchor} hintId={hintId} />}
      <PageSlashMenu />
      <EditorSlot name="editor.overlay" props={{}} />
    </div>
  );
}
