import { FormEditor } from "../forms";
import { FormComposer, DraftCanvas, SourceEditor, DraftStatus, FormSchemaEditor } from "../host";
import { govbbFormEditor } from "../presets/govbb-form";
import type { DraftStore } from "../persistence/draft-store";

const column =
  "mx-auto w-full max-w-[calc(var(--page-width)+200px)] max-lg:max-w-(--page-width) max-md:max-w-[min(var(--page-width),100vw)]";

export function WorkspaceFormEditor({ store, active }: { store: DraftStore; active: boolean }) {
  return (
    <FormComposer definition={govbbFormEditor} store={store} readOnly={!active}>
      {active && (
        <div
          className="flex flex-wrap items-center gap-2 bg-brand-dark px-4 py-2 text-14 font-semibold text-white"
          aria-label="Form tools"
        >
          <SourceEditor />
          <FormSchemaEditor />
          <span className="ms-auto font-normal">
            <DraftStatus />
          </span>
        </div>
      )}
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
