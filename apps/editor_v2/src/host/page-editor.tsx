import { useState, type ReactNode } from "react";
import { Eye, FileText, PencilSimple } from "@phosphor-icons/react";
import { EditorComposer } from "../editor";
import {
  PageDetailsFields,
  PageEditor,
  PageHistoryControls,
  PageTitleField,
  PagePreview,
} from "../pages";
import { govbbPageBodyEditor, govbbPageEditor } from "../presets/govbb-page";
import type { DraftStore } from "../persistence/draft-store";
import { Button } from "../ui/button";
import {
  DraftEditorBinding,
  DraftProvider,
  DraftStatus,
  SourceEditor,
  useDraft,
  type ServerSaveStatus,
} from "./source-ui";

/** A page's heading when its details are kept outside its Markdown. */
type PageHeading = { title: string; lede?: string };

/** What a host adds around a page draft: its own save controls, notices and status. */
type PageHost = {
  /** Details the host keeps as fields, shown above the body; the page's Markdown is then its body alone. */
  fields?: PageHeading & { panel: ReactNode };
  tools?: ReactNode;
  notice?: ReactNode;
  saveStatus?: ServerSaveStatus;
  /** Someone else is editing the page, so it can be read here but not changed. */
  readOnly?: boolean;
};

export function PageDraftEditor({
  store,
  active = true,
  ...host
}: { store: DraftStore; active?: boolean } & PageHost) {
  return (
    <DraftProvider store={store}>
      <PageDraft active={active} {...host} />
    </DraftProvider>
  );
}

function PageDraft({
  active,
  fields,
  tools,
  notice,
  saveStatus,
  readOnly = false,
}: { active: boolean } & PageHost) {
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
            <DraftStatus server={saveStatus} />
          </span>
          {tools && <div className="page-document-actions">{tools}</div>}
        </div>
        {notice}
        <div className="page-source-document">
          {fields?.panel}
          <h1>Edit this page in Markdown</h1>
          <p>
            This page contains content the visual editor cannot edit. Its Markdown is preserved, and
            you can edit and download it here.
          </p>
          <div inert={readOnly}>
            <SourceEditor inline documentLabel="page" fileName="page.md" />
          </div>
        </div>
      </div>
    ) : null;

  const paused = draft.dirty || !!draft.conflict || !!draft.recovery || !!draft.replacement;

  return (
    <EditorComposer
      definition={fields ? govbbPageBodyEditor : govbbPageEditor}
      initialState={draft.state}
      readOnly={preview || !active || readOnly}
    >
      <DraftEditorBinding />
      <div className="page-document-shell">
        <div hidden={!active} className="page-document-tools" aria-label="Page tools">
          <span className="page-tool-label">
            <FileText aria-hidden="true" /> {preview ? "Preview" : "Page editor"}
          </span>
          <span className="page-save-status">
            <DraftStatus server={saveStatus} />
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
            {active && !readOnly && (
              <span className="page-source-control">
                <SourceEditor documentLabel="page" fileName="page.md" />
              </span>
            )}
            {tools && (
              <>
                <span className="page-tools-divider" aria-hidden="true" />
                {tools}
              </>
            )}
          </div>
        </div>
        {active && notice}
        {paused && active && (
          <p className="page-document-paused" role="status">
            Page editing is paused. Open Markdown to apply or discard source changes, or resolve the
            draft issue.
          </p>
        )}
        <div className="page-document-canvas">
          <div hidden={preview} inert={paused || preview} className="page-document-writing">
            {fields?.panel ?? (
              <>
                <PageTitleField />
                <PageDetailsFields />
              </>
            )}
            <PageEditor label="Page content" />
          </div>
          {preview && <PagePreviewSurface source={draft.committed} heading={fields} />}
        </div>
      </div>
    </EditorComposer>
  );
}

/** A read-only page preview whose links don't navigate away from the editor. */
export function PagePreviewSurface({ source, heading }: { source: string; heading?: PageHeading }) {
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
      {heading ? (
        <PagePreview
          source={source}
          definition={govbbPageBodyEditor}
          title={heading.title}
          lede={heading.lede}
        />
      ) : (
        <PagePreview source={source} definition={govbbPageEditor} />
      )}
    </div>
  );
}
