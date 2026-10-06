import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from "lexical";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "../../src/editor/react/editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createDraftCodec } from "../../src/forms/editor/codec";
import {
  $blockId,
  $createFormTitleNode,
  $createInputNode,
  $createPageTitleNode,
  $createQuestionNode,
  $createWidgetNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
  $setSettings,
} from "../../src/forms/editor/nodes";
import { $createMentionNode } from "../../src/forms/features/mentions/node";

const editors = new Map<string, LexicalEditor>();

const codec = createDraftCodec(createFormRuntime(govbbFormEditor));

const fixture = {
  ready: () => editors.size === 2,
  state: (name: string) => editors.get(name)!.getEditorState().toJSON(),
  source: (name: string) => codec.encode(editors.get(name)!.getEditorState().toJSON()),
  readOnly: (name: string, value: boolean) => editors.get(name)!.setEditable(!value),
};

declare global {
  interface Window {
    logicModulesFixture: typeof fixture;
  }
}

window.logicModulesFixture = fixture;

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

const initialize = (name: string) => () => {
  const input = $createInputNode("number");

  const calculated = $setSettings($createWidgetNode("calculated-fields"), {
    calculatedFields: [{ id: "score", name: "Score", type: "NUMBER", value: 0 }],
  });

  const rule = $createWidgetNode("conditional-logic");
  $getRoot().append(
    $setSettings($createFormTitleNode().append($createTextNode(`${name} form`)), {
      logicVersion: 2,
    }),
    $createPageTitleNode().append($createTextNode("Your event")),
    $createQuestionNode().append($createTextNode("Speaker count")),
    input,
    calculated,
    rule,
  );
  $ensureBlockIds($getRoot());
  $ensureQuestionFields($getRoot());
  $setSettings(rule, {
    logicalOperator: "AND",
    conditionals: [
      {
        id: "condition",
        type: "SINGLE",
        field: $questionKey(input),
        comparison: "GREATER_THAN",
        value: 1,
      },
    ],
    actions: [
      {
        id: "calculate",
        type: "CALCULATE",
        calculate: {
          field: `${$blockId(calculated)}:score`,
          operator: "FORMULA",
          expression: "1 + 2",
        },
      },
    ],
  });
  $getRoot().append(
    $createParagraphNode().append(
      $createTextNode("Speakers: "),
      $createMentionNode($questionKey(input), "Speaker count"),
    ),
    $createParagraphNode().append($createTextNode("Answer: ")),
  );
};

function Form({ name }: { name: string }) {
  return (
    <section data-fixture={name}>
      <Editor definition={govbbFormEditor} initialize={initialize(name)} label={`${name} form`}>
        <Bind name={name} />
      </Editor>
    </section>
  );
}

function App() {
  const [first, setFirst] = useState(true);

  return (
    <>
      <button onClick={() => setFirst(false)}>Unmount first form</button>
      {first && <Form name="First" />}
      <Form name="Second" />
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
