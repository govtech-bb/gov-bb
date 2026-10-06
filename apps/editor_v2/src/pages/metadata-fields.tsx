import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { $pageMetadataNode, $setPageMetadata, pageMetadataFromYaml } from "./metadata";

function usePageMetadata() {
  const [editor] = useLexicalComposerContext();

  const yaml = useSyncExternalStore(
    (notify) => editor.registerUpdateListener(notify),
    () => editor.getEditorState().read(() => $pageMetadataNode().getYaml(), { editor }),
  );

  return { editor, metadata: pageMetadataFromYaml(yaml) };
}

export function PageTitleField() {
  const { editor, metadata } = usePageMetadata();
  const editable = useLexicalEditable();
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = input.current;

    if (!element) return;

    const resize = () => {
      if (!element.clientWidth) return;
      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    };

    let width = element.clientWidth;

    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        resize();
      }
    });

    resize();
    observer.observe(element);

    return () => observer.disconnect();
  }, [metadata.title]);

  return (
    <div className="page-document-heading">
      <label className="page-title-label">
        <span className="sr-only">Page title</span>
        <textarea
          ref={input}
          aria-label="Page title"
          rows={1}
          className="page-title-input"
          value={metadata.title ?? ""}
          readOnly={!editable}
          placeholder="Untitled page"
          onChange={(event) => editor.update(() => $setPageMetadata({ title: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      {metadata.lede && <p className="page-document-lede">{metadata.lede}</p>}
    </div>
  );
}
