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
import { DraftEditorBinding, DraftProvider } from "../../src/host/source-ui";
import { DraftStore, type DraftCodec } from "../../src/persistence";

const definition = defineEditor([TextModule(), HistoryModule()]);

const codec: DraftCodec = {
  prepare: (source) => ({
    state: definition.validateDocument(JSON.parse(source)),
    source,
    diagnostics: [],
  }),
  encode: (state) => JSON.stringify(state),
  prepareLegacy: definition.validateDocument,
};

const editors = new Map<string, LexicalEditor>();

const stores = new Map<string, DraftStore>();

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

const fixture = {
  snapshot: (name: string) => stores.get(name)!.getSnapshot(),
  edit: (name: string, source: string) => stores.get(name)!.edit(source),
  apply: (name: string) => stores.get(name)!.apply(),
  discard: (name: string) => stores.get(name)!.discard(),
  editable: (name: string) => editors.get(name)!.isEditable(),
  text: (name: string) => editors.get(name)!.read(() => $getRoot().getTextContent()),
  write: (name: string, text: string) =>
    editors.get(name)!.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(text))),
      { discrete: true, tag: HISTORY_PUSH_TAG },
    ),
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

function Hosted({ name }: { name: string }) {
  const [store] = useState(() => {
    const store = new DraftStore(codec.encode(state(name + " original")), codec);
    stores.set(name, store);

    return store;
  });

  return (
    <Editor definition={definition} initialState={store.initial.state} label={name}>
      <DraftProvider store={store}>
        <DraftEditorBinding />
        <Probe name={name} />
      </DraftProvider>
    </Editor>
  );
}

function App() {
  const [first, setFirst] = useState(true);

  return (
    <>
      <button onClick={() => setFirst(false)}>Unmount first</button>
      {first && <Hosted name="First" />}
      <Hosted name="Second" />
      <Editor definition={definition} label="Without source binding">
        <Probe name="Without source binding" />
      </Editor>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
