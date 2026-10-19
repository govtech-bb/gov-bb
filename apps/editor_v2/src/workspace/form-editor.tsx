import { UndoRedo } from "../editor/react/undo-redo";
import { FormEditor } from "../forms";
import {
  FormComposer,
  DraftCanvas,
  SourceEditor,
  FormJsonDialog,
  FormTitle,
  PausedNotice,
  useDraftSave,
} from "../host";
import { govbbFormEditor } from "../presets/govbb-form";
import type { DraftStore } from "../persistence/draft-store";
import { DocumentBar } from "../ui/document-bar";

const column =
  "mx-auto w-full max-w-[calc(var(--page-width)+200px)] max-lg:max-w-(--page-width) max-md:max-w-[min(var(--page-width),100vw)]";

export function WorkspaceFormEditor({ store, active }: { store: DraftStore; active: boolean }) {
  return (
    <FormComposer definition={govbbFormEditor} store={store} readOnly={!active}>
      <FormDocumentBar active={active} />
      <div className="form-builder-container flex min-w-0 flex-1 flex-col overflow-x-hidden outline-none max-md:px-2 max-sm:px-0">
        <div className="h-10 shrink-0 max-sm:h-0" />
        <div className={column}>
          <DraftCanvas>
            <FormEditor />
          </DraftCanvas>
        </div>
        <div className="h-24 flex-1 max-sm:h-12" />
      </div>
    </FormComposer>
  );
}

/** The slots a form fills in its document bar. Preview and the settings toggle come with the form's own panel. */
function FormDocumentBar({ active }: { active: boolean }) {
  return (
    <DocumentBar
      label="Form tools"
      hidden={!active}
      title={<FormTitle />}
      save={useDraftSave("form-source.md")}
      undo={<UndoRedo />}
      source={
        active && (
          <>
            <SourceEditor />
            <FormJsonDialog />
          </>
        )
      }
      notices={<PausedNotice documentLabel="form" />}
    />
  );
}
