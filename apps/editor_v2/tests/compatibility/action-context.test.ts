import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getState,
  type NodeKey,
} from "lexical";
import { $availableActions, executeAction } from "../../src/editor/core/actions";
import { govbbFormEditor as legacyFormDefinition } from "../../src/presets/govbb-form";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
} from "../../src/forms/editor/nodes";
import { $createWidgetNode, widgetState } from "../../src/forms/editor/answer-nodes";
import { $setSettings } from "../../src/editor/core/document-state";
import insertionOrder from "../fixtures/forms/insertion-order.json";
import { createFormEditor } from "../helpers/form-editor";

test("configured form actions preserve ordering and contextual bare-answer choices", () => {
  const editor = createFormEditor();

  let line = "",
    title = "";

  try {
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        const question = $createQuestionNode().append($createTextNode("Your name"));
        $getRoot().append($createFormTitleNode(), $createPageTitleNode(), paragraph, question);
        line = paragraph.getKey();
        title = question.getKey();
      },
      { discrete: true },
    );

    for (const targetKey of [line, title])
      editor.getEditorState().read(
        () => {
          const expected = [...insertionOrder];

          expected.splice(expected.indexOf("GOVBB_ADDRESS_LOOKUP"), 0, "question_INPUT_BOOLEAN");

          const legacy = expected.map((id) =>
            targetKey === title ? id.replace(/^question_/, "") : id,
          );

          const configured = $availableActions(editor, legacyFormDefinition, { targetKey });
          expect(configured.map((action) => action.id)).toEqual(legacy);
          expect(configured.some((action) => action.id === "INPUT_TEXT")).toBe(targetKey === title);
          expect(configured.some((action) => action.id === "question_INPUT_TEXT")).toBe(
            targetKey !== title,
          );
        },
        { editor },
      );
  } finally {
    editor.dispose();
  }
});

test("changing a page purpose while insertion is open rechecks policy before removing the slash query", () => {
  const editor = createFormEditor();

  let pageKey: NodeKey = "",
    targetKey: NodeKey = "",
    prepared = false;

  try {
    editor.update(
      () => {
        const page = $createWidgetNode("page-break"),
          target = $createParagraphNode().append($createTextNode("/time"));

        $getRoot().append(
          $createFormTitleNode(),
          $createPageTitleNode(),
          page,
          $createPageTitleNode(),
          target,
        );
        pageKey = page.getKey();
        targetKey = target.getKey();
      },
      { discrete: true },
    );
    expect(
      editor
        .getEditorState()
        .read(
          () =>
            $availableActions(editor, legacyFormDefinition, { targetKey }).some(
              (action) => action.id === "question_INPUT_TIME",
            ),
          { editor },
        ),
    ).toBe(true);
    editor.update(
      () => {
        $setSettings($getNodeByKey(pageKey)!, { confirmation: true });
      },
      { discrete: true },
    );
    const changed = editor.getEditorState().toJSON();
    expect(
      executeAction(editor, legacyFormDefinition, "question_INPUT_TIME", { targetKey }, () => {
        prepared = true;
      }).executed,
    ).toBe(false);
    expect(prepared).toBe(false);
    expect(editor.getEditorState().toJSON()).toEqual(changed);
    expect(
      editor
        .getEditorState()
        .read(() => $getNodeByKey(targetKey)!.getTextContent(), { editor: editor }),
    ).toBe("/time");
  } finally {
    editor.dispose();
  }
});

test("widget storage parsing preserves unknown values for configured document validation", () => {
  const editor = createFormEditor();

  try {
    const futureWidget = { type: "widget", version: 1, widget: "future-widget" };

    const widget = editor.parseEditorState({
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [futureWidget],
      },
    });

    expect(widget.read(() => String($getState($getRoot().getFirstChild()!, widgetState)))).toBe(
      "future-widget",
    );
    expect(() => legacyFormDefinition.validateDocument(widget.toJSON())).toThrow(
      "Unavailable widget field or block: future-widget",
    );
  } finally {
    editor.dispose();
  }
});
