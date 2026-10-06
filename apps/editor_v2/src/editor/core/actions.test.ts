import { expect, test } from "vitest";
import {
  $addUpdateTag,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  type ParagraphNode,
} from "lexical";
import { $availableActions, $executeAction, executeAction, type EditorAction } from "./actions";
import { createHeadlessEditor } from "./create-editor";
import { editorDefinition } from "./context";
import { defineEditor } from "./definition";
import { TextModule } from "../modules/text/module";
import { HistoryModule } from "../modules/history/module";

test("stale targets and changed availability refuse before any surface or feature mutation", () => {
  let before = 0,
    executed = 0;

  const action: EditorAction = {
    id: "insert",
    title: "Insert",
    group: "Extensions",
    $available: ({ target }) => target.getTextContent() === "available",
    $execute: () => {
      executed++;
    },
  };

  const definition = defineEditor([TextModule(), { key: "contribution", actions: [action] }]);
  const editor = createHeadlessEditor(definition);
  let targetKey = "";

  try {
    editor.update(
      () => {
        const target = $createParagraphNode().append($createTextNode("available"));
        $getRoot().clear().append(target);
        targetKey = target.getKey();
      },
      { discrete: true },
    );
    expect(
      editor
        .getEditorState()
        .read(() => $availableActions(editor, definition, { targetKey }))
        .map((item) => item.id),
    ).toEqual(["insert"]);
    editor.update(
      () => {
        $getRoot().getFirstChild<ParagraphNode>()!.clear().append($createTextNode("unavailable"));
      },
      { discrete: true },
    );
    const unavailable = editor.getEditorState().toJSON();
    expect(
      executeAction(editor, definition, "insert", { targetKey }, () => {
        before++;
      }).executed,
    ).toBe(false);
    expect(editor.getEditorState().toJSON()).toEqual(unavailable);
    editor.update(
      () => {
        $getRoot().clear().append($createParagraphNode());
      },
      { discrete: true },
    );
    const deleted = editor.getEditorState().toJSON();
    expect(
      executeAction(editor, definition, "insert", { targetKey }, () => {
        before++;
      }).executed,
    ).toBe(false);
    expect(editor.getEditorState().toJSON()).toEqual(deleted);
    expect(before).toBe(0);
    expect(executed).toBe(0);
  } finally {
    editor.dispose();
  }
});

test("surface preparation and contributed insertion share one undo transaction", async () => {
  const action: EditorAction = {
    id: "insert",
    title: "Insert",
    group: "Extensions",
    $execute: ({ target }) => {
      $addUpdateTag(HISTORY_PUSH_TAG);
      target.replace($createParagraphNode().append($createTextNode("Inserted")));
    },
  };

  const definition = defineEditor([
    TextModule(),
    HistoryModule(),
    { key: "contribution", actions: [action] },
  ]);

  const editor = createHeadlessEditor(definition);
  let targetKey = "";

  try {
    editor.update(
      () => {
        const target = $createParagraphNode().append($createTextNode("/insert"));
        $getRoot().clear().append(target);
        targetKey = target.getKey();
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const before = editor.getEditorState().toJSON();

    const outcome = executeAction(editor, definition, "insert", { targetKey }, () => {
      $getRoot().getFirstChild<ParagraphNode>()!.clear();
    });

    expect(outcome.executed).toBe(true);
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("Inserted");
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});

test("actions cannot use another editor's definition or survive their owner's disposal", () => {
  const first = defineEditor([TextModule()]),
    other = defineEditor([
      TextModule(),
      {
        key: "foreign",
        actions: [
          {
            id: "foreign",
            title: "Foreign",
            group: "Other",
            $execute: () => {
              throw Error("must not execute");
            },
          },
        ],
      },
    ]);

  const editor = createHeadlessEditor(first);
  expect(editorDefinition(editor)).toBe(first);
  const targetKey = editor.getEditorState().read(() => $getRoot().getFirstChild()!.getKey());
  expect(() => executeAction(editor, other, "foreign", { targetKey })).toThrow(
    "installed definition",
  );
  editor.dispose();
  expect(() => editorDefinition(editor)).toThrow("no installed definition");
});

test("Lexical callbacks get synchronous execution and completion results within their existing update", () => {
  let calls = 0,
    completed = 0;

  const definition = defineEditor([
    TextModule(),
    {
      key: "callback",
      actions: [
        {
          id: "callback",
          title: "Callback",
          group: "Extensions",
          $execute: () => {
            calls++;

            return {
              afterClose: () => {
                completed++;
              },
            };
          },
        },
      ],
    },
  ]);

  const editor = createHeadlessEditor(definition);

  try {
    editor.update(
      () => {
        const outcome = $executeAction(editor, definition, "callback", {
          targetKey: $getRoot().getFirstChild()!.getKey(),
        });

        expect(outcome.executed).toBe(true);
        expect(calls).toBe(1);
        outcome.result?.afterClose?.();
        expect(completed).toBe(1);
      },
      { discrete: true },
    );
    expect(calls).toBe(1);
  } finally {
    editor.dispose();
  }
});

test("synchronous action execution cannot borrow another editor's active document", () => {
  let executed = false;

  const definition = defineEditor([
    TextModule(),
    {
      key: "action",
      actions: [
        {
          id: "insert",
          title: "Insert",
          group: "Extensions",
          $execute: () => {
            executed = true;
          },
        },
      ],
    },
  ]);

  const first = createHeadlessEditor(definition),
    second = createHeadlessEditor(definition);

  try {
    second.update(
      () => {
        expect(() =>
          $executeAction(first, definition, "insert", {
            targetKey: $getRoot().getFirstChild()!.getKey(),
          }),
        ).toThrow("owning editor's update");
      },
      { discrete: true },
    );
    expect(executed).toBe(false);
  } finally {
    first.dispose();
    second.dispose();
  }
});
