import { useState } from "react";
import { Eye, FileText, PencilSimple } from "@phosphor-icons/react";
import { EditorComposer } from "../editor";
import { PageEditor, PageHistoryControls, PageTitleField, PagePreview } from "../pages";
import { govbbPageEditor } from "../presets/govbb-page";
import type { DraftStore } from "../persistence/draft-store";
import { Button } from "../ui/button";
import {
  DraftEditorBinding,
  DraftProvider,
  DraftStatus,
  SourceEditor,
  useDraft,
} from "./source-ui";

export function PageDraftEditor({ store, active = true }: { store: DraftStore; active?: boolean }) {
  return (
    <DraftProvider store={store}>
      <PageDraft active={active} />
    </DraftProvider>
  );
}

function PageDraft({ active }: { active: boolean }) {
  const draft = useDraft();
  const [preview, setPreview] = useState(false);

  if (draft.mode === "source" || !draft.state)
    return active ? (
      <div className="page-document-shell">
        <div className="page-document-tools" aria-label="Page tools">
          <span className="page-tool-label">
            <FileText aria-hidden="true" /> Page source
          </span>
          <span className="page-save-status">
            <DraftStatus />
          </span>
        </div>
        <div className="page-source-document">
          <h1>Edit this page in Markdown</h1>
          <p>
            This page contains content the visual editor cannot edit. Its Markdown is preserved, and
            you can edit and download it here.
          </p>
          <SourceEditor inline documentLabel="page" fileName="page.md" />
        </div>
      </div>
    ) : null;

  const paused = draft.dirty || !!draft.conflict || !!draft.recovery || !!draft.replacement;

  return (
    <EditorComposer
      definition={govbbPageEditor}
      initialState={draft.state}
      readOnly={preview || !active}
    >
      <DraftEditorBinding />
      <div className="page-document-shell">
        <div hidden={!active} className="page-document-tools" aria-label="Page tools">
          <span className="page-tool-label">
            <FileText aria-hidden="true" /> {preview ? "Preview" : "Page editor"}
          </span>
          <span className="page-save-status">
            <DraftStatus />
          </span>
          <div className="page-document-actions">
            <PageHistoryControls />
            <span className="page-tools-divider" aria-hidden="true" />
            <Button
              icon={preview ? <PencilSimple /> : <Eye />}
              disabled={paused}
              onClick={() => setPreview((value) => !value)}
            >
              {preview ? "Back to editing" : "Preview page"}
            </Button>
            {active && (
              <span className="page-source-control">
                <SourceEditor documentLabel="page" fileName="page.md" />
              </span>
            )}
          </div>
        </div>
        {paused && active && (
          <p className="page-document-paused" role="status">
            Page editing is paused. Open Markdown to apply or discard source changes, or resolve the
            draft issue.
          </p>
        )}
        <div className="page-document-canvas">
          <div hidden={preview} inert={paused || preview} className="page-document-writing">
            <PageTitleField />
            <PageEditor label="Page content" />
          </div>
          {preview && <PagePreviewSurface source={draft.committed} />}
        </div>
      </div>
    </EditorComposer>
  );
}

function PagePreviewSurface({ source }: { source: string }) {
  return (
    <div
      className="page-document-preview"
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" && event.target instanceof Element && event.target.closest("a"))
          event.preventDefault();
      }}
    >
      <PagePreview source={source} definition={govbbPageEditor} />
    </div>
  );
}
