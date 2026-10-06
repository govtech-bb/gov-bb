import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $parseSerializedNode,
  $getSelection,
  $isRangeSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "../../src/editor/react/editor";
import { InsertModal } from "../../src/editor/react/insert-modal";
import { executeAction, type ActionRequest } from "../../src/editor/core/actions";
import { defineFormEditor } from "../../src/forms/definition";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { defineFormRegistryEntry } from "../../src/forms/registry/definition";
import { question, content } from "../../src/forms/registry/builders";
import { prepareRegistryEntry, $instantiateRegistryEntry } from "../../src/forms/editor/registry";
import { $insertBlocks } from "../../src/forms/editor/insertion";

import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";

const savedKey = "registry-insertion-fixture";

const rejected = defineFormRegistryEntry({
  scope: "fragment",
  key: "test/external",
  version: 1,
  title: "External reference",
  description: "Intentionally invalid fixture",
  blocks: [
    question({ id: "local", key: "local", kind: "text", label: "Local" }),
    content({ id: "external", kind: "paragraph", content: [{ answer: "outside-this-template" }] }),
  ],
});

const definition = defineFormEditor({
  modules: [
    ...govbbFormModules,
    {
      key: "test-rejection",
      actions: [
        {
          id: "test-rejection",
          title: "Reject external reference",
          group: "Test",
          $prepare: ({ target }) => {
            const prepared = $instantiateRegistryEntry(prepareRegistryEntry(rejected, definition));

            return () => {
              $insertBlocks(prepared, target);
            };
          },
        },
      ],
    },
  ],
});

let active: LexicalEditor | undefined;

let removedTrigger = false;

const fixture = {
  ready: () => !!active,
  state: () => active!.getEditorState().toJSON(),
  source: () => lexicalToMarkdown(active!.getEditorState().toJSON(), definition),
  selection: () =>
    active!.read(() => {
      const value = $getSelection();

      return $isRangeSelection(value)
        ? [value.anchor.key, value.anchor.offset, value.focus.key, value.focus.offset]
        : null;
    }),
  schema: () => lexicalToFormSchema(active!.getEditorState(), definition, active!).schema,
  removedTrigger: () => removedTrigger,
};

declare global {
  interface Window {
    registryInsertionFixture: typeof fixture;
  }
}

window.registryInsertionFixture = fixture;

function Controls() {
  const [editor] = useLexicalComposerContext();
  const [error, setError] = useState("");
  const [request, setRequest] = useState<ActionRequest | null>(null);
  useEffect(() => {
    active = editor;

    return () => {
      active = undefined;
    };
  }, [editor]);

  const insert = (id: string) => {
    const targetKey = editor.read(() => $getRoot().getLastChild()!.getKey());

    const result = executeAction(
      editor,
      definition,
      id,
      { targetKey },
      id === "test-rejection"
        ? () => {
            removedTrigger = true;
            $getRoot().getLastChild()!.remove();
          }
        : undefined,
    );

    setError(result.error ?? "");
  };

  return (
    <>
      <nav aria-label="Fixture actions">
        <button
          onClick={() =>
            setRequest({ targetKey: editor.read(() => $getRoot().getLastChild()!.getKey()) })
          }
        >
          Open insert modal
        </button>
        <button onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
          Undo insertion
        </button>
        <button onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
          Redo insertion
        </button>
        <button onClick={() => insert("test-rejection")}>Reject external reference</button>
        <button
          onClick={() => {
            localStorage.setItem(savedKey, fixture.source());
          }}
        >
          Save source
        </button>
        <output aria-label="Insertion error">{error}</output>
      </nav>
      <InsertModal request={request} onClose={() => setRequest(null)} />
    </>
  );
}

const saved = localStorage.getItem(savedKey);

const initialState = saved === null ? undefined : markdownToLexical(saved, definition).state;

if (saved !== null && !initialState) throw Error("The saved fixture did not reload");

const prepared = formSchemaToLexical(
  {
    schemaVersion: 2,
    id: "registry-form",
    title: "Application",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [{ id: "details", type: "page", role: "questions", title: "Your details" }],
  },
  definition,
);

if (prepared.status !== "ready")
  throw Error(prepared.diagnostics.map((issue) => issue.message).join("\n"));

const initialize = () =>
  $getRoot().append(
    ...prepared.state.root.children.map((node) => $parseSerializedNode(node)),
    $createParagraphNode(),
  );

createRoot(document.getElementById("app")!).render(
  <Editor
    definition={definition}
    initialState={initialState}
    initialize={initialize}
    label="Registry form"
  >
    <Controls />
  </Editor>,
);
