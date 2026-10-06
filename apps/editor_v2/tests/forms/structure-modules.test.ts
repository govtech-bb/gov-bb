import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_DOWN_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { executeAction } from "../../src/editor/core/actions";
import { registerEditorHistory } from "../../src/editor/core/history";
import {
  $createOptionNode,
  $createQuestionNode,
  $addLogicAfter,
} from "../../src/forms/editor/nodes";
import { $canAddFollowUp } from "../../src/forms/editor/nesting";
import { blockShortcuts } from "../../src/forms/editor/structure/keyboard";
import { $createLogic } from "../../src/forms/features/logic/authoring";
import { expect, test } from "vitest";
import { TextModule } from "../../src/editor/modules/text/module";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineFormEditor } from "../../src/forms/definition";
import { WidgetNode } from "../../src/forms/editor/answer-nodes";
import { blockSelectionState } from "../../src/forms/editor/structure/selection-state";
import { selectBlocks } from "../../src/forms/editor/structure/selection";
import { rubberBand } from "../../src/forms/editor/structure/rubber-band";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import type { FormModule } from "../../src/forms/field";

const family: FormModule = {
  key: "test-widget-family",
  nodes: [{ type: "widget", node: WidgetNode }],
  storageFamilies: [{ type: "widget", property: "widget", defaultValue: "page-break" }],
};

const pageClaim = {
  storage: { type: "widget", property: "widget", value: "page-break", defaultValue: "page-break" },
  containerClassName: "page-marker",
};

const definition = (extra: FormModule[] = []) =>
  defineFormEditor({ modules: [TextModule({ browser: false }), family, ...extra] });

const raw = (widget: string, state?: string) => ({
  root: {
    type: "root",
    children: [{ type: "widget", widget, ...(state && { $: { widget: state } }) }],
  },
});

test("structural storage has one immutable module owner and validates both raw discriminator forms", () => {
  const owned = { ...pageClaim, storage: { ...pageClaim.storage } };
  const configured = definition([{ key: "test-pages", structural: [owned] }]);
  owned.storage.value = "changed-after-composition";
  owned.containerClassName = "changed";
  expect(configured.structural[0]?.containerClassName).toBe("page-marker");
  expect(JSON.stringify(configured.validateDocument(raw("page-break")))).toBe(
    JSON.stringify(raw("page-break")),
  );
  expect(() => configured.validateDocument(raw("page-break", "future-widget"))).toThrow(
    "future-widget",
  );
  expect(() => definition().validateDocument(raw("page-break"))).toThrow("page-break");
  expect(() =>
    definition([
      { key: "first", structural: [pageClaim] },
      { key: "second", structural: [pageClaim] },
    ]),
  ).toThrow("Overlapping document storage");
});

test("form lifecycle keeps structural history before repeat/page/source-key registrations", () => {
  expect(govbbFormEditor.registrations.map((registration) => registration.key)).toEqual([
    "form-structure",
    "repeat-markers",
    "page-headings",
    "source-keys",
    "native-authoring",
  ]);
  expect(govbbFormEditor.moduleKeys.filter((key) => key.includes("history"))).toEqual([]);
  expect(govbbFormEditor.structural.map((claim) => claim.storage.value)).toEqual(["page-break"]);
  expect(govbbFormEditor.logicActions.map((action) => action.type)).toEqual([
    "JUMP_TO_PAGE",
    "CALCULATE",
    "REQUIRE_ANSWER",
    "SHOW_BLOCKS",
    "HIDE_BLOCKS",
    "CHANGE_LABEL",
    "CHANGE_PAGE_TITLE",
    "HIDE_BUTTON_TO_DISABLE_COMPLETION",
  ]);
});

test("block selection state is shared within one editor, isolated from another, and reset on remount", () => {
  const first = createHeadlessEditor(govbbFormEditor),
    second = createHeadlessEditor(govbbFormEditor);

  const cleanFirst = selectBlocks(first),
    cleanBand = rubberBand(first),
    cleanSecond = selectBlocks(second);

  try {
    const firstState = blockSelectionState(first),
      secondState = blockSelectionState(second);

    firstState.toggled = "first-block";
    secondState.toggled = "second-block";
    expect(blockSelectionState(first)).toBe(firstState);
    expect(blockSelectionState(second).toggled).toBe("second-block");
    expect(firstState).not.toBe(secondState);
    cleanBand();
    cleanFirst();
    const remounted = selectBlocks(first);

    try {
      expect(blockSelectionState(first)).not.toBe(firstState);
      expect(blockSelectionState(first).toggled).toBeNull();
      expect(blockSelectionState(second).toggled).toBe("second-block");
    } finally {
      remounted();
    }
  } finally {
    cleanSecond();
    first.dispose();
    second.dispose();
  }
});

test("removing logic refuses keyboard and follow-up authoring before changing document, selection or history", () => {
  const definition = defineFormEditor({
    modules: govbbFormModules.filter(
      (module) => module.key !== "form-logic" && module.key !== "form-registry",
    ),
  });

  const editor = createHeadlessEditor(definition);
  let target = "";
  editor.update(
    () => {
      const option = $createOptionNode("checkboxes").append($createTextNode("Yes"));
      $getRoot().append($createQuestionNode().append($createTextNode("Continue?")), option);
      target = option.getKey();
      option.selectEnd();
    },
    { discrete: true },
  );

  const cleanupHistory = registerEditorHistory(editor),
    cleanupKeys = blockShortcuts(editor);

  const selection = () =>
    editor.read(() => {
      const value = $getSelection();

      return $isRangeSelection(value)
        ? [value.anchor.key, value.anchor.offset, value.focus.key, value.focus.offset]
        : null;
    });

  try {
    const before = editor.getEditorState().toJSON(),
      beforeSelection = selection();

    editor.update(
      () => {
        const option = $getRoot().getLastChild()!;
        expect($canAddFollowUp(option)).toBe(false);
        expect($addLogicAfter(option)).toBeUndefined();
        expect(() => $createLogic(option, { id: "unavailable" })).toThrow("not installed");
      },
      { discrete: true },
    );
    let removedQuery = false;
    expect(
      executeAction(
        editor,
        definition,
        "question_INPUT_TEXT",
        { targetKey: target, mode: "follow-up" },
        () => {
          removedQuery = true;
        },
      ).executed,
    ).toBe(false);
    expect(removedQuery).toBe(false);
    editor.update(
      () =>
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          Object.assign(new Event("keydown", { cancelable: true }), {
            key: "l",
            metaKey: true,
            ctrlKey: false,
            shiftKey: true,
            altKey: false,
            isComposing: false,
            keyCode: 76,
            detail: 0,
            view: null,
            which: 76,
            initUIEvent() {
              throw Error("Legacy UI initialization is unsupported by this fixture");
            },
            code: "KeyL",
            charCode: 0,
            location: 0,
            repeat: false,
            DOM_KEY_LOCATION_STANDARD: 0,
            DOM_KEY_LOCATION_LEFT: 1,
            DOM_KEY_LOCATION_RIGHT: 2,
            DOM_KEY_LOCATION_NUMPAD: 3,
            getModifierState: (key: string) => key === "Meta" || key === "Shift",
            initKeyboardEvent() {
              throw Error("Legacy event initialization is unsupported by this fixture");
            },
          } as const),
        ),
      { discrete: true },
    );
    expect(editor.getEditorState().toJSON()).toEqual(before);
    expect(selection()).toEqual(beforeSelection);
    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    cleanupKeys();
    cleanupHistory();
    editor.dispose();
  }
});
