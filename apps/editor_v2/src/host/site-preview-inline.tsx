import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { createPortal } from "react-dom";
import { useId, useState } from "react";
import { EditorSlot } from "../editor/react/contributions";
import { PageBlockControls } from "../pages/block-controls";
import { PageSlashMenu } from "../pages/slash-menu";
import { useHeadingFields } from "../pages/metadata-fields";
import type { SitePreviewRegions } from "./site-preview-renderer";
import "./site-preview.css";

/** The existing Lexical session owns all three source fields; landing owns their placement. */
export function SitePreviewInline({ regions }: { regions: SitePreviewRegions }) {
  const { titleProps, ledeProps } = useHeadingFields();
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const hintId = useId();

  return (
    <>
      {createPortal(<textarea {...titleProps} className="cms-inline-field" />, regions.title)}
      {createPortal(<textarea {...ledeProps} className="cms-inline-field" />, regions.lede)}
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
