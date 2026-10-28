import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useId, useState } from "react";
import { EditorSlot } from "../editor/react/contributions";
import { PageBlockControls } from "./block-controls";
import { PageSlashMenu } from "./slash-menu";
import "./page.css";

export function PageEditor({ label = "Page content" }: { label?: string }) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const hintId = useId();

  return (
    // The page reaches left into a gutter, where the block rail sits
    <div
      className="page-editor relative -ms-(--page-gutter) ps-(--page-gutter) [--page-gutter:4.5rem]"
      ref={setAnchor}
    >
      <ContentEditable
        aria-label={label}
        aria-describedby={hintId}
        // The block being dragged fades, to show it's the one moving. One line tall at the least, whether or not the
        // page is empty, so Add content under it doesn't drop as the first letter is typed
        className="page-body page-editable min-h-13 outline-none *:data-dragged:opacity-40"
      />
      {anchor && <PageBlockControls anchor={anchor} hintId={hintId} />}
      <PageSlashMenu />
      <EditorSlot name="editor.overlay" props={{}} />
    </div>
  );
}
