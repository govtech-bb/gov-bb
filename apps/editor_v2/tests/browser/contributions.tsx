import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  $create,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  DecoratorNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { defineEditor } from "../../src/editor/core/definition";
import { TextModule } from "../../src/editor/modules/text/module";
import { HistoryModule } from "../../src/editor/modules/history/module";
import { Editor } from "../../src/editor/react/editor";
import {
  EditorSlot,
  RendererHost,
  defineRenderer,
  defineSlot,
} from "../../src/editor/react/contributions";
import { InsertModal } from "../../src/editor/react/insert-modal";
import type { ActionRequest } from "../../src/editor/core/actions";

class ProofNode extends DecoratorNode<ReactNode> {
  override $config() {
    return this.config("extension-proof", { extends: DecoratorNode });
  }
  override createDOM() {
    return document.createElement("div");
  }
  override updateDOM() {
    return false;
  }
  override isInline() {
    return false;
  }
  override decorate() {
    return <RendererHost name="extension:proof" props={{ value: "Shared storage kind" }} />;
  }
}

const nodeDefinition = { type: "extension-proof", node: ProofNode };

const editors = new Map<string, LexicalEditor>();

const completed = new Map<string, number>();

const fixture = {
  completions: (name: string) => completed.get(name) ?? 0,
  state: (name: string) => editors.get(name)!.getEditorState().toJSON(),
  text: (name: string) =>
    editors
      .get(name)!
      .getEditorState()
      .read(() => $getRoot().getTextContent()),
  replaceTarget: (name: string) =>
    editors.get(name)!.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode("Replacement")));
      },
      { discrete: true },
    ),
};

declare global {
  interface Window {
    contributionsFixture: typeof fixture;
  }
}

window.contributionsFixture = fixture;

function definitionFor(name: string) {
  return defineEditor(
    [
      TextModule(),
      HistoryModule(),
      {
        key: "external-contribution",
        nodes: [nodeDefinition],
        renderers: [
          defineRenderer("extension:proof", ({ value }: { value: string }) => (
            <div data-testid={`${name}-renderer`}>
              {name} renderer: {value}
            </div>
          )),
        ],
        slots: [
          defineSlot("extension-inspector", "test.inspector", ({ label }: { label: string }) => (
            <div data-testid={`${name}-inspector`}>
              {name} inspector: {label}
            </div>
          )),
        ],
        actions: [
          {
            id: "EXTERNAL_ACTION",
            title: "Test contribution",
            group: "Extensions",
            keywords: "outside",
            description: "A separately configured contribution",
            preview: <div data-testid="extension-preview">{name} preview</div>,
            $execute: ({ target }) => {
              $addUpdateTag(HISTORY_PUSH_TAG);

              const paragraph = $createParagraphNode().append(
                $createTextNode(`${name} contributed content`),
              );

              target.replace(paragraph);
              const widget = paragraph.insertAfter($create(ProofNode));
              widget.insertAfter($createParagraphNode()).selectEnd();

              return {
                afterClose: () => {
                  completed.set(name, (completed.get(name) ?? 0) + 1);
                },
              };
            },
          },
        ],
      },
    ],
    `extension-proof-${name}`,
  );
}

const first = definitionFor("First"),
  second = definitionFor("Second");

function Surfaces({ name }: { name: string }) {
  const [editor] = useLexicalComposerContext();
  const [request, setRequest] = useState<ActionRequest | null>(null);
  useEffect(() => {
    editors.set(name, editor);
  }, [editor, name]);

  return (
    <>
      <button
        onClick={() =>
          editor
            .getEditorState()
            .read(() => setRequest({ targetKey: $getRoot().getFirstChild()!.getKey() }))
        }
      >
        Open {name} insertion
      </button>
      <InsertModal request={request} onClose={() => setRequest(null)} />
      <EditorSlot name="test.inspector" props={{ label: "owned controls" }} />
    </>
  );
}

createRoot(document.getElementById("app")!).render(
  <>
    <section>
      <Editor definition={first} label="First">
        <Surfaces name="First" />
      </Editor>
    </section>
    <section>
      <Editor definition={second} label="Second">
        <Surfaces name="Second" />
      </Editor>
    </section>
  </>,
);
