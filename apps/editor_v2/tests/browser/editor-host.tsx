import { useState } from "react";
import { PageDraftEditor } from "../../src/host/page-editor";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { createRoot } from "react-dom/client";
import { UndoRedo } from "../../src/editor/react/undo-redo";
import { FormEditor } from "../../src/forms";
import {
  DraftCanvas,
  FormComposer,
  FormTitle,
  FormJsonDialog,
  PausedNotice,
  SourceEditor,
  useDraftSave,
} from "../../src/host";
import { DraftStore } from "../../src/persistence";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { DocumentBar } from "../../src/ui/document-bar";
import { TipProvider } from "../../src/ui/tooltip";
import "../../index.css";

declare global {
  interface Window {
    editorFixtureInput: { source: string; kind: "form" | "page" };
    editorFixture: {
      source: () => string;
      snapshot: () => ReturnType<DraftStore["getSnapshot"]>;
      kind: "form" | "page";
    };
  }
}

const { source, kind } = window.editorFixtureInput;

const store = new DraftStore(source, kind === "form" ? govbbFormCodec : govbbPageCodec);

window.editorFixture = {
  source: () => store.getSnapshot().committed,
  snapshot: store.getSnapshot,
  kind,
};

function FormBar() {
  return (
    <DocumentBar
      label="Form tools"
      title={<FormTitle />}
      save={useDraftSave("form-source.md")}
      undo={<UndoRedo />}
      source={
        <>
          <SourceEditor />
          <FormJsonDialog />
        </>
      }
      notices={<PausedNotice documentLabel="form" />}
    />
  );
}

function PageFixture() {
  const [active, setActive] = useState(true);

  const [other] = useState(
    () => new DraftStore("---\ntitle: Other page\n---\n\nOther content.\n", govbbPageCodec),
  );

  return (
    <>
      <nav aria-label="Fixture pages">
        <button onClick={() => setActive(true)}>Entry page</button>
        <button onClick={() => setActive(false)}>Other page</button>
      </nav>
      <section hidden={!active} inert={!active}>
        <PageDraftEditor store={store} active={active} />
      </section>
      <section hidden={active} inert={active}>
        <PageDraftEditor store={other} active={!active} />
      </section>
    </>
  );
}

// Only bundled by buildBrowserFixture; not a production route or persistence host.
createRoot(document.getElementById("app")!).render(
  <TipProvider delay={300}>
    {kind === "page" ? (
      <PageFixture />
    ) : (
      <FormComposer definition={govbbFormEditor} store={store}>
        <FormBar />
        <div className="form-builder-container flex min-w-0 flex-1 flex-col overflow-x-hidden outline-none max-md:px-2 max-sm:px-0">
          <div className="h-10 shrink-0 max-sm:h-0" />
          <div className="mx-auto w-full max-w-[calc(var(--page-width)+200px)] max-lg:max-w-(--page-width) max-md:max-w-[min(var(--page-width),100vw)]">
            <DraftCanvas>
              <FormEditor />
            </DraftCanvas>
          </div>
          <div className="h-24 flex-1 max-sm:h-12" />
        </div>
      </FormComposer>
    )}
  </TipProvider>,
);
