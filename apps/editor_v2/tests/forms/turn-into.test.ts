import { expect, test } from "vitest";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from "lexical";
import { $turnLineInto } from "../../src/editor/core/turn-into";
import { $createDrawnInput } from "../../src/forms/editor/field-nodes";
import { $createQuestionNode } from "../../src/forms/editor/nodes";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { createFormEditor } from "../helpers/form-editor";

const turnInto = govbbFormEditor.turnInto!;

function withForm(run: (editor: LexicalEditor) => void) {
  const editor = createFormEditor();

  try {
    run(editor);
  } finally {
    editor.dispose();
  }
}

test("a form's text block turns into another through the one Turn into the toolbar and shortcuts use", () =>
  withForm((editor) => {
    editor.update(
      () => {
        const line = $createParagraphNode().append($createTextNode("Before you start"));
        $getRoot().append(line);
        line.selectEnd();

        const offer = turnInto.$choices();
        expect(offer?.value).toBe("TEXT");
        expect(offer?.choices.map((choice) => choice.label)).toEqual([
          "Text",
          "Question label",
          "Heading 1",
          "Heading 2",
          "Heading 3",
          "Bulleted list",
          "Numbered list",
          "Inset text",
          "Warning text",
          "Details",
        ]);
        expect(offer?.choices.find((choice) => choice.label === "Heading 2")?.keys).toEqual([
          "mod",
          "alt",
          "2",
        ]);
        turnInto.$turnInto("HEADING_2");
      },
      { discrete: true },
    );
    editor.read(() =>
      expect($getRoot().getLastChild()?.exportJSON()).toMatchObject({ type: "heading", tag: "h2" }),
    );
    editor.read(() => expect($getRoot().getLastChild()?.getTextContent()).toBe("Before you start"));
  }));

test("a question's label doesn't turn, as in the block's menu: it goes with its answer", () =>
  withForm((editor) =>
    editor.update(
      () => {
        const label = $createQuestionNode().append($createTextNode("Full name"));
        $getRoot().append(label, $createDrawnInput("text"));
        label.selectEnd();
        expect(turnInto.$choices()).toBeNull();
      },
      { discrete: true },
    ),
  ));

test("a text choice from the “/” menu turns a form's line that has text", () =>
  withForm((editor) => {
    editor.update(
      () => {
        const line = $createParagraphNode().append($createTextNode("Fees /h2"));
        $getRoot().append(line);
        const typed = line.getFirstChild<import("lexical").TextNode>()!.splitText(5)[1]!;
        typed.select();

        expect($turnLineInto(govbbFormEditor, "HEADING_2", line, "/h2", () => typed.remove())).toBe(
          true,
        );
      },
      { discrete: true },
    );
    editor.read(() => {
      expect($getRoot().getLastChild()?.exportJSON()).toMatchObject({ type: "heading", tag: "h2" });
      expect($getRoot().getLastChild()?.getTextContent()).toBe("Fees");
    });
  }));
