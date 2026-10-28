import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { createPortal } from "react-dom";
import { useId, useState } from "react";
import { EditorSlot } from "../editor/react/contributions";
import { PageBlockControls } from "../pages/block-controls";
import { PageSlashMenu } from "../pages/slash-menu";
import { useAutoHeight, useMetadataUpdate } from "../pages/metadata-fields";
import type { SitePreviewRegions } from "./site-preview-renderer";
import "./site-preview.css";

/** The existing Lexical session owns all three source fields; landing owns their placement. */
export function SitePreviewInline({ regions }: { regions: SitePreviewRegions }) {
  const { metadata, editable, update, historyKeys } = useMetadataUpdate();
  const title = useAutoHeight(metadata.title);
  const lede = useAutoHeight(metadata.lede);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const hintId = useId();

  return (
    <>
      {createPortal(
        <textarea
          ref={title}
          aria-label="Page title"
          rows={1}
          className="cms-inline-field"
          value={metadata.title ?? ""}
          readOnly={!editable}
          placeholder="Untitled page"
          onChange={(event) => update({ title: event.target.value })}
          {...historyKeys}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;

            if (event.key === "Enter") {
              event.preventDefault();
              lede.current?.focus();
            } else historyKeys.onKeyDown(event);
          }}
        />,
        regions.title,
      )}
      {createPortal(
        <textarea
          ref={lede}
          aria-label="Introduction"
          rows={1}
          className="cms-inline-field"
          value={metadata.lede ?? ""}
          readOnly={!editable}
          placeholder="Add an introduction (optional)"
          onChange={(event) => update({ lede: event.target.value || undefined })}
          {...historyKeys}
        />,
        regions.lede,
      )}
      {createPortal(
        <div ref={setAnchor} className="cms-inline-body-anchor">
          <ContentEditable
            className="govbb-prose cms-inline-body"
            aria-label="Page content"
            aria-describedby={hintId}
          />
          <div data-cms-editor-controls="">
            {anchor && <PageBlockControls anchor={anchor} hintId={hintId} />}
            <PageSlashMenu />
            <EditorSlot name="editor.overlay" props={{}} />
          </div>
        </div>,
        regions.body,
      )}
    </>
  );
}
