import { expect, test } from "vitest";
import { $createTextNode, $getRoot, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { executeAction } from "../../src/editor/core/actions";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { isAuthoredMessage } from "../../src/forms/core/validation-messages";
import {
  $setNativeErrorMessage,
  nativeErrorMessages,
} from "../../src/forms/editor/native-field-controls";
import { applyNativeQuestionSettings } from "../../src/forms/editor/native-settings";
import { $native, $setNative } from "../../src/forms/editor/native-state";
import { $isQuestionNode } from "../../src/forms/editor/nodes";
import type { AnyFormDefinition, QuestionBase } from "../../src/forms/schema/types";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { emptyNativeForm, nativeHost, nativeOutput } from "../helpers/native-form";

const exportedQuestions = (editor: LexicalEditor) =>
  nativeOutput(editor).blocks.filter((block) => block.type === "question");

const $answer = () =>
  $getRoot()
    .getChildren()
    .find((node) => $native(node).question)!;

const $relabel = (text: string) =>
  $getRoot().getChildren().find($isQuestionNode)!.clear().append($createTextNode(text));

test("a new question stores no error message, and export words one from the label it has then", () => {
  const editor = nativeHost();

  try {
    const targetKey = editor.read(() => $getRoot().getLastChild()!.getKey());
    expect(
      executeAction(editor, govbbFormEditor, "question_INPUT_TEXT", { targetKey }).executed,
    ).toBe(true);
    editor.update(() => $relabel("Your National ID number"), { discrete: true });

    expect(editor.read(() => $native($answer()).question!.required)).toEqual({
      value: true,
      message: "",
    });
    expect(exportedQuestions(editor)[0]!.required).toEqual({
      value: true,
      message: "Enter your National ID number",
    });

    // The menu shows it as the default, worded the same way
    const [required] = editor.read(() =>
      nativeErrorMessages($native($answer()).question!, {
        kind: "text",
        label: "Your National ID number",
        optionCount: 0,
      }),
    );

    expect(required).toMatchObject({ message: "Enter your National ID number", pinned: false });

    // A default follows the label
    editor.update(() => $relabel("Your passport number"), { discrete: true });
    expect(exportedQuestions(editor)[0]!.required?.message).toBe("Enter your passport number");

    // The draft holds no message for it, and reloads without a blank-message warning
    const source = govbbFormCodec.encode(editor.getEditorState().toJSON());
    expect(source).not.toContain("::error");
    expect(govbbFormCodec.prepare(source).diagnostics).toEqual([]);
  } finally {
    editor.dispose();
  }
});

test("turning on a limit or a date rule stores no message for it either", () => {
  const question = applyNativeQuestionSettings(
    { id: "name", type: "question", kind: "text", key: "name" },
    { required: true, hasMinCharacters: true, minCharacters: 3, beforeDate: "2030-01-01" },
    { required: true, hasMinCharacters: true, minCharacters: 3, beforeDate: "2030-01-01" },
  );

  expect(question.required?.message).toBe("");
  expect(question.validation?.map((rule) => rule.message)).toEqual(["", ""]);
});

const form = (questions: QuestionBase[]): AnyFormDefinition => ({
  ...emptyNativeForm,
  blocks: [...emptyNativeForm.blocks, ...questions],
});

test("a saved “Enter an answer” counts as no message, while a message the author wrote is kept", () => {
  const imported = formSchemaToLexical(
    form([
      {
        id: "name",
        type: "question",
        kind: "text",
        key: "name",
        label: "Your name",
        required: { value: true, message: "Enter an answer" },
        validation: [
          { id: "name-min", type: "minLength", value: 3, message: "Enter a valid answer" },
        ],
      },
      {
        id: "email",
        type: "question",
        kind: "email",
        key: "email",
        label: "Email address",
        required: { value: true, message: "Tell us where to email you" },
      },
    ]),
    govbbFormEditor,
  );

  if (imported.status !== "ready") throw Error(imported.diagnostics[0]?.message);
  const editor = createHeadlessEditor(govbbFormEditor, imported.state);

  try {
    const [name, email] = exportedQuestions(editor);
    expect(name!.required?.message).toBe("Enter your name");
    expect(name!.validation?.[0]?.message).toBe("Your name must be 3 characters or more");
    expect(email!.required?.message).toBe("Tell us where to email you");

    // The draft keeps what it stored; the menu shows the default for it
    const messages = editor.read(() =>
      nativeErrorMessages($native($answer()).question!, {
        kind: "text",
        label: "Your name",
        optionCount: 0,
      }),
    );

    expect(messages.map(({ message, pinned }) => [message, pinned])).toEqual([
      ["Enter your name", false],
      ["Your name must be 3 characters or more", false],
    ]);

    // An old draft in Markdown, holding the placeholder, loads and exports the better default
    editor.update(
      () =>
        $setNative($answer(), {
          question: {
            ...$native($answer()).question!,
            required: { value: true, message: "Enter an answer" },
          },
        }),
      { discrete: true },
    );
    const source = govbbFormCodec.encode(editor.getEditorState().toJSON());
    expect(source).toContain('::error{rule="required" message="Enter an answer"}');
    const reloaded = createHeadlessEditor(govbbFormEditor, govbbFormCodec.prepare(source).state);

    try {
      expect(exportedQuestions(reloaded)[0]!.required?.message).toBe("Enter your name");
    } finally {
      reloaded.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("Reset to default stores no message, so the default follows the label again", () => {
  const imported = formSchemaToLexical(
    form([
      {
        id: "name",
        type: "question",
        kind: "text",
        key: "name",
        label: "Your name",
        required: { value: true, message: "Tell us your name" },
      },
    ]),
    govbbFormEditor,
  );

  if (imported.status !== "ready") throw Error(imported.diagnostics[0]?.message);
  const editor = createHeadlessEditor(govbbFormEditor, imported.state);

  try {
    editor.update(
      () => {
        const [required] = nativeErrorMessages($native($answer()).question!, {
          kind: "text",
          label: "Your name",
          optionCount: 0,
        });

        expect(required!.pinned).toBe(true);
        $setNativeErrorMessage($answer(), required!, undefined);
        $relabel("Your full name");
      },
      { discrete: true },
    );

    expect(editor.read(() => $native($answer()).question!.required?.message)).toBe("");
    expect(exportedQuestions(editor)[0]!.required?.message).toBe("Enter your full name");
  } finally {
    editor.dispose();
  }
});

test("only a message the author wrote counts as theirs", () => {
  expect(isAuthoredMessage("Enter your name")).toBe(true);

  for (const message of [
    "",
    "  ",
    "Enter an answer",
    "Enter a valid answer",
    "Enter a date in the permitted range",
  ])
    expect(isAuthoredMessage(message)).toBe(false);
});
