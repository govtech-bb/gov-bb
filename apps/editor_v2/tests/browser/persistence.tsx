import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineEditor } from "../../src/editor/core/definition";
import { HistoryModule } from "../../src/editor/modules/history/module";
import { TextModule } from "../../src/editor/modules/text/module";
import { Editor } from "../../src/editor/react/editor";
import { DraftEditorBinding, DraftProvider, useDraft } from "../../src/host/source-ui";
import { DraftStore, initialDraft } from "../../src/persistence/draft-store";
import type { DraftCodec, DraftKeys } from "../../src/persistence/types";

const definition = defineEditor([TextModule(), HistoryModule()]);

const codec: DraftCodec = {
  prepare: (source) => ({
    state: definition.validateDocument(JSON.parse(source)),
    source,
    diagnostics: [],
  }),
  encode: (state) => JSON.stringify(state),
  prepareLegacy: (value) => definition.validateDocument(value),
};

const keys = (name: string): DraftKeys => ({
  committed: `${name}:saved`,
  working: `${name}:working`,
  previous: `${name}:old`,
  legacy: `${name}:legacy`,
});

const values = new Map<string, string>(),
  editors = new Map<string, LexicalEditor>();

const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
  removeItem: (key: string) => {
    values.delete(key);
  },
};

const stores = new Map<string, { store: DraftStore; calls: { external: number; flush: number } }>();

function state(text: string) {
  const editor = createHeadlessEditor(definition, undefined, {
    initialize: () => $getRoot().append($createParagraphNode().append($createTextNode(text))),
  });

  try {
    return editor.getEditorState().toJSON();
  } finally {
    editor.dispose();
  }
}

function createStore(name: string) {
  const configured = keys(name);
  values.set(configured.committed, codec.encode(state(`${name} saved`)));

  const initial = initialDraft(
    storage,
    () => {
      throw Error("Must load saved content");
    },
    codec,
    configured,
  );

  const store = new DraftStore(storage, initial, codec, configured),
    calls = { external: 0, flush: 0 };

  const externalChange = store.externalChange,
    flush = store.flush;

  store.externalChange = (key) => {
    calls.external++;
    externalChange(key);
  };

  store.flush = () => {
    calls.flush++;
    flush();
  };

  stores.set(name, { store, calls });

  return store;
}

const fixture = {
  snapshot: (name: string) => stores.get(name)!.store.getSnapshot(),
  calls: (name: string) => ({ ...stores.get(name)!.calls }),
  saved: (name: string) => values.get(keys(name).committed),
  text: (name: string) =>
    editors
      .get(name)!
      .getEditorState()
      .read(() => $getRoot().getTextContent()),
  write: (name: string, text: string) =>
    editors.get(name)!.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(text))),
      { discrete: true, tag: HISTORY_PUSH_TAG },
    ),
  external: (name: string, text: string) => {
    values.set(keys(name).committed, codec.encode(state(text)));
    window.dispatchEvent(new StorageEvent("storage", { key: keys(name).committed }));
  },
  keepLocal: (name: string) => stores.get(name)!.store.useLocal(),
};

declare global {
  interface Window {
    persistenceFixture: typeof fixture;
  }
}

window.persistenceFixture = fixture;

function Probe({ name }: { name: string }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editors.set(name, editor);

    return () => {
      editors.delete(name);
    };
  }, [editor, name]);

  return null;
}

function Status() {
  const draft = useDraft();

  return <output>{draft.status}</output>;
}

function Hosted({ name }: { name: string }) {
  const [store] = useState(() => createStore(name));

  return (
    <section data-fixture={name}>
      <Editor definition={definition} initialState={store.initial.state} label={name}>
        <DraftProvider store={store}>
          <DraftEditorBinding />
          <Probe name={name} />
          <Status />
        </DraftProvider>
      </Editor>
    </section>
  );
}

function App() {
  const [first, setFirst] = useState(true);

  return (
    <>
      <button onClick={() => setFirst(false)}>Unmount first</button>
      {first && <Hosted name="First" />}
      <Hosted name="Second" />
      <Editor definition={definition} label="Without storage">
        <Probe name="Without storage" />
      </Editor>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
