import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useId, useState } from "react";
import { EditorSlot } from "../editor/react/contributions";
import { PageBlockControls } from "../pages/block-controls";
import { PageSlashMenu } from "../pages/slash-menu";
import { useHeadingFields } from "../pages/metadata-fields";
import { ProsePage } from "../templates/prose-page";
import type { PreparedProsePage } from "../templates/prose-page-content";
import "./site-preview.css";

/** The same Lexical session supplies the template's fields; there is no second editor. */
export function SitePreviewInline({
  page,
  editing,
}: {
  page: PreparedProsePage;
  editing: boolean;
}) {
  const { titleProps, ledeProps } = useHeadingFields();
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const hintId = useId();

  return (
    <ProsePage
      page={page}
      editableRegions={
        editing
          ? {
              title: <textarea {...titleProps} className="cms-inline-field" />,
              lede: <textarea {...ledeProps} className="cms-inline-field" />,
              body: (
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
                </div>
              ),
            }
          : undefined
      }
    />
  );
}
