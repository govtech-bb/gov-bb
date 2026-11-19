import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineEditor } from "../../src/editor/core/definition";
import { TextModule } from "../../src/editor/modules/text/module";
import { HistoryModule } from "../../src/editor/modules/history/module";
import { Editor } from "../../src/editor/react/editor";

const editors = new Map<string, LexicalEditor>();

const browserHooks = new Set<LexicalEditor>();

const keyListeners = new Set<EventListenerOrEventListenerObject>();

const add = document.addEventListener.bind(document),
  remove = document.removeEventListener.bind(document);

document.addEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  if (type === "keydown") keyListeners.add(listener);
  add(type, listener, options);
};

document.removeEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
) => {
  if (type === "keydown") keyListeners.delete(listener);
  remove(type, listener, options);
};

const definition = defineEditor(
  [
    TextModule(),
    HistoryModule(),
    {
      key: "browser-lifecycle-probe",
      registrations: [
        {
          key: "probe",
          phase: "browser",
          register: (editor) => {
            browserHooks.add(editor);

            return () => {
              browserHooks.delete(editor);
            };
          },
        },
      ],
    },
  ],
  "composition-browser-test",
);

let nativePrevented: boolean | undefined;

const fixture = {
  get nativePrevented() {
    return nativePrevented;
  },
  set nativePrevented(value: boolean | undefined) {
    nativePrevented = value;
  },
  text: (name: string) =>
    editors
      .get(name)!
      .getEditorState()
      .read(() => $getRoot().getTextContent()),
  state: (name: string) => editors.get(name)!.getEditorState().toJSON(),
  hooks: () => browserHooks.size,
  documentKeyListeners: () => keyListeners.size,
  detachedUndo: (name: string) => editors.get(name)!.dispatchCommand(UNDO_COMMAND, undefined),
  headlessState: () => {
    const editor = createHeadlessEditor(definition);

    try {
      return editor.getEditorState().toJSON();
    } finally {
      editor.dispose();
    }
  },
};

declare global {
  interface Window {
    compositionFixture: typeof fixture;
  }
}

window.compositionFixture = fixture;

function Controls({ name }: { name: string }) {
  const [editor] = useLexicalComposerContext();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    editors.set(name, editor);
  }, [editor, name]);

  const write = (value: string) =>
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(value)));
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );

  return (
    <>
      <button
        onClick={() => {
          const next = revision + 1;
          setRevision(next);
          write(`${name} edit ${next}`);
        }}
      >
        {name} edit
      </button>
      <button>{name} focus</button>
      <input
        aria-label={`${name} native input`}
        onKeyDown={(event) => {
          const native = event.nativeEvent;
          queueMicrotask(() => {
            fixture.nativePrevented = native.defaultPrevented;
          });
        }}
      />
      {createPortal(
        <button data-testid={`${name}-portal`} onClick={() => write(`${name} portal edit`)}>
          {name} portal edit
        </button>,
        document.getElementById("portals")!,
      )}
    </>
  );
}

function App() {
  const [first, setFirst] = useState(true),
    [second, setSecond] = useState(true),
    [readOnly, setReadOnly] = useState(false);

  return (
    <>
      <nav>
        <button onClick={() => setReadOnly((value) => !value)}>Toggle Second read-only</button>
        <button onClick={() => setFirst((value) => !value)}>
          {first ? "Unmount" : "Mount"} First
        </button>
        <button onClick={() => setSecond((value) => !value)}>
          {second ? "Unmount" : "Mount"} Second
        </button>
      </nav>
      {first && (
        <section>
          <Editor definition={definition} label="First">
            <Controls name="First" />
          </Editor>
        </section>
      )}
      {second && (
        <section>
          <Editor definition={definition} label="Second" readOnly={readOnly}>
            <Controls name="Second" />
          </Editor>
        </section>
      )}
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
