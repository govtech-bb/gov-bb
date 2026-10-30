import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Eye, PencilSimpleSlash, X } from "@phosphor-icons/react";
import { EditorComposer } from "../editor";
import { UndoRedo } from "../editor/react/undo-redo";
import {
  PageEditor,
  PageSettings,
  PageTitleField,
  readPageMetadata,
  type PageSettingsOptions,
} from "../pages";
import { usePageMetadata } from "../pages/metadata-fields";
import { govbbPageEditor } from "../presets/govbb-page";
import { draftPause, type DraftStore } from "../persistence/draft-store";
import { Bar } from "../ui/bar";
import { DocumentBar } from "../ui/document-bar";
import { EmptyState } from "../ui/empty-state";
import type { SaveStateProps } from "../ui/save-state";
import type { LinkPage } from "../ui/link-picker";
import { SidePanel, useSidePanel } from "../ui/side-panel";
import { LinkSelection, LinkWarnings, type LinkWarningProps } from "./link-warnings";
import { SitePreview, type SitePreviewTools } from "./site-preview";
import type { SitePreviewContext } from "./site-preview-renderer";
import { DraftEditorBinding, DraftProvider, useDraft, useDraftSave } from "./source-ui";

// The page document's frame: its bar, notices, the canvas the page is written on and the panel of its settings

// The window less the header above it
const shell = "flex min-h-[calc(100dvh-var(--bar-height))] flex-col bg-white";

/** What a host adds to a page draft's frame: the page's settings, where it stands there, and its slots in the bar. */
type PageHost = {
  /** Before the title in the page's bar, such as what shows the host's list of pages while it's hidden. */
  nav?: ReactNode;
  settings?: PageSettingsOptions;
  /** Where the page stands against the host's last server save. */
  server?: SaveStateProps;
  /** Sends the changes on: Publish changes, or Save. */
  publish?: ReactNode;
  notice?: ReactNode;
  /** The pages its links can find by title. */
  linkPages?: readonly LinkPage[];
  /** Links to pages that don't exist, or that they couldn't be checked: shown with the notices. */
  linkWarnings?: LinkWarningProps;
  previewContext?: SitePreviewContext;
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
  nav,
  settings,
  server,
  publish,
  notice,
  linkPages,
  linkWarnings,
  previewContext,
}: { active: boolean } & PageHost) {
  const draft = useDraft();
  const save = useDraftSave("page.md", server);
  const [preview, setPreview] = useState(false);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [selecting, setSelecting] = useState<readonly number[]>();
  const clearSelecting = useCallback(() => setSelecting(undefined), []);
  const writerScrollY = useRef(0);
  const panel = useSidePanel();

  // Unsupported pages stay read-only; no source editor or publication controls are offered.
  if (draft.mode === "source" || !draft.state)
    return active ? (
      <div className={shell}>
        <DocumentBar
          label="Page tools"
          nav={nav}
          title={<SourceTitle source={draft.committed} />}
          save={server}
          notices={notice}
        />
        <EmptyState
          icon={<PencilSimpleSlash />}
          title="This page can’t be edited here"
          description="It has content the editor doesn’t support, such as raw HTML. The saved page stays as it is."
        />
      </div>
    ) : null;

  const paused = !!draftPause(draft);

  const notices = (
    <>
      {notice}
      {linkWarnings && (
        <LinkWarnings
          {...linkWarnings}
          onSelect={(path) => {
            // Back to writing first: the link is in the page, not in its preview
            if (preview) {
              setInlineEditing(false);
              setPreview(false);
            }

            setSelecting(path);
          }}
        />
      )}
    </>
  );

  // Reuse the document bar in preview without exposing inactive writer controls.
  const controls = (tools?: SitePreviewTools) => (
    <DocumentBar
      label="Page tools"
      hidden={!active}
      nav={nav}
      title={<PageTitle />}
      heading={!tools}
      save={save}
      undo={
        tools ? (
          <>
            {inlineEditing && <UndoRedo />}
            {tools.edit}
          </>
        ) : (
          <UndoRedo />
        )
      }
      preview={
        <>
          <Bar.Tool
            data-site-preview-trigger=""
            icon={tools ? <X /> : <Eye />}
            label={tools ? "Close preview" : "Preview page"}
            disabled={!tools && paused}
            onClick={() => {
              // Capture before unmounting the writer; a preview retry must not replace this position.
              if (!preview) writerScrollY.current = window.scrollY;
              setInlineEditing(false);
              setPreview((value) => !value);
            }}
          />
          {tools?.about}
        </>
      }
      publish={publish}
      settings={!tools && <SidePanel.Toggle panel={panel} label="Page settings" />}
      notices={notices}
    />
  );

  return (
    <EditorComposer
      definition={govbbPageEditor}
      initialState={draft.state}
      readOnly={!active || (preview && !inlineEditing)}
      linkPages={linkPages}
    >
      <DraftEditorBinding />
      <LinkSelection path={selecting} ready={active && !preview} onDone={clearSelecting} />
      <div className={shell}>
        {!preview && controls()}
        <div className="flex flex-1">
          <div className="min-w-0 flex-1">
            <div className="mx-auto w-[min(100%,59rem)] ps-[clamp(4.75rem,7vw,6.5rem)] pe-[clamp(2rem,4vw,4rem)] pt-[clamp(2.5rem,5vw,4.5rem)] pb-28 max-md:ps-18 max-md:pe-5 max-md:pt-8">
              {!preview && (
                <div inert={paused} className="page-document-writing">
                  <PageTitleField error={settings?.errors?.title} />
                  <PageEditor label="Page content" />
                </div>
              )}
            </div>
          </div>
          {active && !preview && (
            <SidePanel.Root panel={panel} label="Page settings" inert={paused}>
              <PageSettings {...settings} />
            </SidePanel.Root>
          )}
        </div>
      </div>
      {preview && active && (
        <SitePreview
          source={draft.committed}
          context={previewContext}
          editing={inlineEditing}
          paused={paused}
          onEditingChange={setInlineEditing}
          controls={controls}
          writerScrollY={writerScrollY.current}
        />
      )}
    </EditorComposer>
  );
}

/** The page's title as it's typed: the field on the canvas is the h1's source. */
function PageTitle() {
  return usePageMetadata().metadata.title || "Untitled page";
}

/** Reads an unsupported page's title without mounting the visual editor. */
function SourceTitle({ source }: { source: string }) {
  return useMemo(() => readPageMetadata(source).title, [source]) || "Untitled page";
}
