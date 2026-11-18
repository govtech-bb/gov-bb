import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $setSelection,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "../../src/editor/react/editor";
import { contentEditor } from "../../src/presets/content";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { executeAction } from "../../src/editor/core/actions";

const editors = new Map<string, LexicalEditor>();

const initialize = (value: string) => () =>
  $getRoot()
    .clear()
    .append($createParagraphNode().append($createTextNode(value)));

const fixture = {
  ready: () => editors.size === 2,
  state: (name: string) => editors.get(name)!.getEditorState().toJSON(),
  text: (name: string) =>
    editors
      .get(name)!
      .getEditorState()
      .read(() => $getRoot().getTextContent(), { editor: editors.get(name)! }),
  select: (name: string, index: number) => {
    const editor = editors.get(name)!;
    editor.focus();
    editor.update(
      () => {
        const block = $getRoot().getChildAtIndex(index);

        if ($isElementNode(block)) {
          const nodes = block.getAllTextNodes();

          if (!nodes.length) block.selectStart();
          else {
            const range = $createRangeSelection();
            range.anchor.set(nodes[0]!.getKey(), 0, "text");
            range.focus.set(nodes.at(-1)!.getKey(), nodes.at(-1)!.getTextContentSize(), "text");
            $setSelection(range);
          }
        }
      },
      { discrete: true },
    );
  },
  caret: (name: string, index: number) => {
    const editor = editors.get(name)!;
    editor.focus();
    editor.update(
      () => {
        const block = index < 0 ? $getRoot().getLastChild() : $getRoot().getChildAtIndex(index);

        if ($isElementNode(block)) block.selectStart();
      },
      { discrete: true },
    );
  },
  reset: (name: string, value: string) =>
    editors.get(name)!.update(initialize(value), { discrete: true }),
  insert: (name: string, id: string) => {
    const editor = editors.get(name)!;

    const targetKey = editor
      .getEditorState()
      .read(() => $getRoot().getLastChild()!.getKey(), { editor });

    return executeAction(editor, contentEditor, id, { targetKey });
  },
  reload: (_name: string) => {},
  setReadOnly: (_value: boolean) => {},
  validate: (state: SerializedEditorState) => {
    const editor = createHeadlessEditor(contentEditor, state);

    try {
      return editor.getEditorState().toJSON();
    } finally {
      editor.dispose();
    }
  },
};

declare global {
  interface Window {
    contentFixture: typeof fixture;
  }
}

window.contentFixture = fixture;

function Bind({ name }: { name: string }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editors.set(name, editor);

    return () => {
      editors.delete(name);
    };
  }, [editor, name]);

  return null;
}

function App() {
  const [first, setFirst] = useState<{ revision: number; state?: SerializedEditorState }>({
    revision: 0,
  });

  const [second, setSecond] = useState<{ revision: number; state?: SerializedEditorState }>({
    revision: 0,
  });

  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    fixture.setReadOnly = setReadOnly;
    fixture.reload = (name) => {
      const state = fixture.state(name),
        set = name === "First" ? setFirst : setSecond;

      set((previous) => ({ revision: previous.revision + 1, state }));
    };
  }, []);

  return (
    <>
      <section>
        <Editor
          key={first.revision}
          definition={contentEditor}
          initialState={first.state}
          initialize={initialize("First content")}
          label="First"
          readOnly={readOnly}
        >
          <Bind name="First" />
        </Editor>
      </section>
      <section>
        <Editor
          key={second.revision}
          definition={contentEditor}
          initialState={second.state}
          initialize={initialize("Second content")}
          label="Second"
        >
          <Bind name="Second" />
        </Editor>
      </section>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
