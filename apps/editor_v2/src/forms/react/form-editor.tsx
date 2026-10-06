import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { $getRoot } from "lexical";
import { useState, useSyncExternalStore } from "react";
import { EditorSlot } from "../../editor/react/contributions";
import { SlashMenu } from "../../editor/react/slash-menu";
import { Gutter } from "./gutter";

/** Form canvas mounted inside an EditorComposer; persistence is an optional host concern. */
export function FormEditor({ label = "Form" }: { label?: string }) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setAnchor}
      className="relative rounded-sm bg-white pt-12 pb-12 shadow-sheet max-sm:rounded-none max-sm:pt-6 max-sm:shadow-none"
    >
      <ContentEditable
        aria-label={label}
        className="px-25 text-(length:--form-text) outline-none [counter-reset:page_1] max-sm:px-6.25 [&>*:not([data-option])]:[counter-reset:option]"
      />
      {anchor && <Gutter anchor={anchor} />}
      <SlashMenu />
      <EditorSlot name="editor.overlay" props={{}} />
      <EditorSlot name="form.canvas-after" props={{}} />
    </div>
  );
}

export function FormName() {
  const [editor] = useLexicalComposerContext();

  const name = useSyncExternalStore(
    (onChange) => editor.registerUpdateListener(onChange),
    () =>
      editor
        .getEditorState()
        .read(() => $getRoot().getFirstChild()?.getTextContent().trim(), { editor }),
  );

  return name || "Untitled form";
}
