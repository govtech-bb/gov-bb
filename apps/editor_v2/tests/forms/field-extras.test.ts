import { createEditor } from "../helpers/default-form";
import { expect, test } from "vitest";
import { HeadingNode } from "@lexical/rich-text";
import { $getRoot } from "lexical";
import { compileForm, preflight, type FormQuestion } from "../helpers/default-form";
import { pageEntries } from "../../src/forms/features/pages/insertion";
import {
  DEFAULT_TIME_INCREMENT,
  positiveIncrementError,
  timeIncrementError,
} from "../../src/forms/features/shared/increments";
import { shortAnswerField } from "../../src/forms/features/short-answer/definition";
import {
  $createFormTitleNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $turnInto,
} from "../../src/forms/editor/nodes";
import { $createInputNode } from "../../src/forms/editor/answer-nodes";
import { $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";

const editorFor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (error) => {
      throw error;
    },
  });

const settle = () => {
  $ensureBlockIds($getRoot());
  $ensureQuestionFields($getRoot());
};

const fields = (editor: ReturnType<typeof editorFor>) =>
  compileForm(editor.getEditorState()).pages.flatMap((page) =>
    page.blocks.filter((block): block is FormQuestion => block.type === "question"),
  );

test("native increments accept positive decimals for numbers and whole seconds for time", () => {
  expect(DEFAULT_TIME_INCREMENT).toBe(1800);

  for (const step of [0.5, 1, 90, 300, 1800]) expect(positiveIncrementError(step)).toBeNull();

  for (const step of [1, 60, 90, 300, 1800]) expect(timeIncrementError(step)).toBeNull();

  for (const step of [0, -1, NaN, Infinity, "60", null]) {
    expect(positiveIncrementError(step)).toBeTruthy();
    expect(timeIncrementError(step)).toBeTruthy();
  }

  expect(timeIncrementError(0.5)).toBe("Enter a whole number of seconds");
  expect(timeIncrementError(undefined)).toBeNull();
  expect(shortAnswerField.validate({ step: "legacy" }, "text")).toEqual([]);
});

test("disabled preserves validation and increments survive JSON without writing inherited defaults", () => {
  const editor = editorFor();
  editor.update(
    () => {
      $getRoot().append(
        $createFormTitleNode(),
        $createInputNode("time"),
        $setSettings($createInputNode("number"), {
          isDisabled: true,
          required: true,
          step: 0.5,
          hasMinNumber: true,
          minNumber: 2,
          hasDefaultAnswer: true,
          defaultAnswer: 3,
        }),
      );
      settle();
    },
    { discrete: true },
  );
  const saved = editor.getEditorState().toJSON();
  const restored = editorFor();
  restored.setEditorState(restored.parseEditorState(saved));
  expect(fields(restored)).toEqual(fields(editor));
  expect(fields(restored)[0]!.settings.step).toBeUndefined();
  expect(fields(restored)[1]!.settings).toMatchObject({
    isDisabled: true,
    step: 0.5,
    required: true,
    minNumber: 2,
    defaultAnswer: 3,
  });
  expect(fields(restored)[1]!.errors.min).toBeTruthy();
});

test("conversion prunes only exported increment and false removes disabled", () => {
  const editor = editorFor();
  editor.update(
    () => {
      const input = $setSettings($createInputNode("number"), { step: 0.5, isDisabled: true });
      $getRoot().append($createFormTitleNode(), input);
      $turnInto(input, "text");
      const converted = $getRoot().getLastChild()!;
      expect($settings(converted).step).toBe(0.5);
      $setSettings(converted, { isDisabled: false });
      settle();
    },
    { discrete: true },
  );
  expect(fields(editor)[0]!.settings.step).toBeUndefined();
  expect(fields(editor)[0]!.settings.isDisabled).toBeUndefined();
});

test("preflight blocks malformed imported steps and a disabled declaration", () => {
  const editor = editorFor();
  editor.update(
    () => {
      const declaration = pageEntries.find((entry) => entry.id === "DECLARATION_PAGE")!.create();
      $setSettings(declaration.at(-1)!, { isDisabled: true });
      $getRoot().append(
        $createFormTitleNode(),
        $setSettings($createInputNode("time"), { step: 0.5 }),
        ...declaration,
      );
      settle();
    },
    { discrete: true },
  );
  const issues = preflight(compileForm(editor.getEditorState()));
  expect(
    issues.filter((issue) => ["field-step", "declaration-disabled"].includes(issue.code)),
  ).toHaveLength(2);
});
