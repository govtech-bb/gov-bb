import { useMemo, useState, type ReactNode } from "react";
import { Eye, PencilSimple } from "@phosphor-icons/react";
import { EditorComposer } from "../editor";
import { UndoRedo } from "../editor/react/undo-redo";
import {
  PageEditor,
  PageSettings,
  PageTitleField,
  PagePreview,
  readPageMetadata,
  type PageSettingsOptions,
} from "../pages";
import { usePageMetadata } from "../pages/metadata-fields";
import { govbbPageEditor } from "../presets/govbb-page";
import { draftPause, type DraftStore } from "../persistence/draft-store";
import { Bar } from "../ui/bar";
import { DocumentBar } from "../ui/document-bar";
import type { SaveStateProps } from "../ui/save-state";
import type { LinkPage } from "../ui/link-picker";
import { SidePanel, useSidePanel } from "../ui/side-panel";
import { PausedNotice } from "./paused-notice";
import {
  DraftEditorBinding,
  DraftProvider,
  SourceEditor,
  useDraft,
  useDraftSave,
} from "./source-ui";

// The page document's frame: its bar, notices, the canvas the page is written on and the panel of its settings

// The window less the header above it
const shell = "flex min-h-[calc(100dvh-var(--bar-height))] flex-col bg-white";

/** What a host adds to a page draft's frame: the page's settings, where it stands there, and its slots in the bar. */
type PageHost = {
  settings?: PageSettingsOptions;
  /** Where the page stands against the host's last server save. */
  server?: SaveStateProps;
  /** The versions saved before this one. */
  versions?: ReactNode;
  /** Sends the changes on: Publish changes, or Save. */
  publish?: ReactNode;
  notice?: ReactNode;
  /** The pages its links can find by title. */
  linkPages?: readonly LinkPage[];
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
  settings,
  server,
  versions,
  publish,
  notice,
  linkPages,
}: { active: boolean } & PageHost) {
  const draft = useDraft();
  const save = useDraftSave("page.md", server);
  const [preview, setPreview] = useState(false);
  const panel = useSidePanel();

  if (draft.mode === "source" || !draft.state)
    return active ? (
      <div className={shell}>
        <DocumentBar
          label="Page tools"
          title={<SourceTitle source={draft.committed} />}
          save={save}
          versions={versions}
          publish={publish}
          notices={notice}
        />
        <div className="mx-auto max-w-272 px-[clamp(1rem,4vw,3rem)] py-8">
          <h2 className="text-28 font-semibold">Edit this page in Markdown</h2>
          <p className="mt-3 mb-4 max-w-[65ch] text-muted">
            This page contains content the visual editor cannot edit. Its Markdown is preserved, and
            you can edit and download it here.
          </p>
          <SourceEditor inline documentLabel="page" fileName="page.md" />
        </div>
      </div>
    ) : null;

  const paused = !!draftPause(draft);

  return (
    <EditorComposer
      definition={govbbPageEditor}
      initialState={draft.state}
      readOnly={preview || !active}
      linkPages={linkPages}
    >
      <DraftEditorBinding />
      <div className={shell}>
        <DocumentBar
          label="Page tools"
          hidden={!active}
          title={<PageTitle />}
          save={save}
          undo={<UndoRedo />}
          preview={
            <Bar.Tool
              icon={preview ? <PencilSimple /> : <Eye />}
              label={preview ? "Back to editing" : "Preview page"}
              disabled={paused}
              onClick={() => setPreview((value) => !value)}
            />
          }
          source={active && <SourceEditor documentLabel="page" fileName="page.md" />}
          versions={versions}
          publish={publish}
          settings={<SidePanel.Toggle panel={panel} label="Page settings" disabled={preview} />}
          notices={
            <>
              {notice}
              <PausedNotice documentLabel="page" />
            </>
          }
        />
        <div className="flex flex-1">
          <div className="min-w-0 flex-1">
            <div className="mx-auto w-[min(100%,59rem)] ps-[clamp(4.75rem,7vw,6.5rem)] pe-[clamp(2rem,4vw,4rem)] pt-[clamp(2.5rem,5vw,4.5rem)] pb-28 max-md:ps-18 max-md:pe-5 max-md:pt-8">
              <div hidden={preview} inert={paused || preview} className="page-document-writing">
                <PageTitleField error={settings?.errors?.title} />
                <PageEditor label="Page content" />
              </div>
              {preview && <PagePreviewSurface source={draft.committed} />}
            </div>
          </div>
          {active && !preview && (
            <SidePanel.Root panel={panel} label="Page settings" inert={paused}>
              <PageSettings {...settings} />
            </SidePanel.Root>
          )}
        </div>
      </div>
    </EditorComposer>
  );
}

/** The page's title as it's typed: the field on the canvas is the h1's source. */
function PageTitle() {
  return usePageMetadata().metadata.title || "Untitled page";
}

/** The title of a page that can only be edited as Markdown, read from its frontmatter. */
function SourceTitle({ source }: { source: string }) {
  return useMemo(() => readPageMetadata(source).title, [source]) || "Untitled page";
}

/** A read-only page preview whose links do not navigate away from the editor. */
export function PagePreviewSurface({ source }: { source: string }) {
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
