import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import {
  $setNativeErrorMessage,
  nativeErrorMessages,
  optionValueError,
  parseOptionValue,
} from "../../src/forms/editor/native-field-controls";
import { $native } from "../../src/forms/editor/native-state";
import { $describe } from "../../src/forms/react/gutter";
import { $setFormSettings } from "../../src/forms/editor/native-settings";
import type { AnyFormDefinition, QuestionBase } from "../../src/forms/schema/types";

function setup(question: QuestionBase) {
  const form: AnyFormDefinition = {
    schemaVersion: 2,
    id: "field-controls",
    title: "Field controls",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [{ id: "page", type: "page", role: "questions", title: "Details" }, question],
  };

  const imported = formSchemaToLexical(form, govbbFormEditor);
  expect(imported.diagnostics).toEqual([]);

  if (imported.status !== "ready") throw Error("Import failed");

  return createHeadlessEditor(govbbFormEditor, imported.state);
}

function exported(editor: ReturnType<typeof setup>) {
  const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
  expect(result.diagnostics).toEqual([]);

  if (result.status !== "ready") throw Error("Export failed");
  const question = result.schema.blocks.find((block) => block.type === "question");

  if (!question || question.type !== "question") throw Error("Missing question");

  return question;
}

test("native message controls read and edit by rule ID, including separate date rules of the same type", () => {
  const question: QuestionBase = {
    id: "date",
    type: "question",
    kind: "date",
    key: "date",
    label: "Date of birth",
    required: { value: true, message: "Give your birth date" },
    validation: [
      {
        id: "required",
        type: "dateBefore",
        value: { context: "today" },
        message: "Use a past date",
      },
      {
        id: "cutoff",
        type: "dateBefore",
        value: "2026-01-01",
        inclusive: true,
        message: "Use the cutoff date",
      },
      {
        id: "oldest",
        type: "dateAfter",
        value: "1900-01-01",
        inclusive: true,
        message: "Use a recent date",
      },
    ],
  };

  const editor = setup(question);

  try {
    editor.update(
      () => {
        const node = $getRoot()
          .getChildren()
          .find((member) => $native(member).question)!;

        const errors = nativeErrorMessages($native(node).question!, {
          kind: "date",
          label: "Date of birth",
          optionCount: 0,
        });

        expect(errors.map((error) => error.message)).toEqual([
          "Give your birth date",
          "Use a past date",
          "Use the cutoff date",
          "Use a recent date",
        ]);
        expect($describe(node.getKey())!.menu.errors).toEqual(errors);
        $setNativeErrorMessage(node, errors[2]!, "Choose a date before the deadline");
      },
      { discrete: true },
    );
    const result = exported(editor);
    expect(result.required).toEqual(question.required);
    expect(result.validation).toEqual(
      question.validation!.map((rule) =>
        rule.id === "cutoff" ? { ...rule, message: "Choose a date before the deadline" } : rule,
      ),
    );

    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);
    const parsed = markdownToLexical(source, govbbFormEditor);
    expect(parsed.diagnostics).toEqual([]);

    if (!parsed.state) throw Error("Missing parsed state");
    const reopened = createHeadlessEditor(govbbFormEditor, parsed.state);

    try {
      expect(exported(reopened)).toEqual(result);
    } finally {
      reopened.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("clearing required and minimum messages stores their displayed defaults in native JSON", () => {
  const editor = setup({
    id: "amount",
    type: "question",
    kind: "number",
    key: "amount",
    label: "Amount",
    required: { value: true, message: "Custom required" },
    validation: [
      { id: "ten", type: "minimum", value: 10, inclusive: true, message: "Custom minimum" },
    ],
  });

  try {
    editor.update(
      () => {
        const node = $getRoot()
          .getChildren()
          .find((member) => $native(member).question)!;

        const errors = nativeErrorMessages($native(node).question!, {
          kind: "number",
          label: "Amount",
          optionCount: 0,
        });

        for (const error of errors) $setNativeErrorMessage(node, error, undefined);
        expect(
          nativeErrorMessages($native(node).question!, {
            kind: "number",
            label: "Amount",
            optionCount: 0,
          }).map((error) => error.pinned),
        ).toEqual([false, false]);
      },
      { discrete: true },
    );
    expect(exported(editor)).toMatchObject({
      required: { value: true, message: "Enter amount" },
      validation: [
        {
          id: "ten",
          type: "minimum",
          value: 10,
          inclusive: true,
          message: "Amount must be 10 or more",
        },
      ],
    });
  } finally {
    editor.dispose();
  }
});

test("choice message edits synchronize all options without changing values or validation IDs", () => {
  const editor = setup({
    id: "choice",
    type: "question",
    kind: "choice",
    key: "choice",
    label: "Choices",
    config: { selection: "multiple" },
    validation: [{ id: "pick-two", type: "minSelections", value: 2, message: "Pick a pair" }],
    options: [
      { id: "one", value: 1, label: "One" },
      { id: "two", value: 2, label: "Two" },
    ],
  });

  try {
    editor.update(
      () => {
        const node = $getRoot()
          .getChildren()
          .find((member) => $native(member).question)!;

        const errors = nativeErrorMessages($native(node).question!, {
          kind: "checkboxes",
          label: "Choices",
          optionCount: 2,
        });

        $setNativeErrorMessage(node, errors[0]!, "Choose both answers");
      },
      { discrete: true },
    );
    expect(exported(editor).validation).toEqual([
      { id: "pick-two", type: "minSelections", value: 2, message: "Choose both answers" },
    ]);
    expect(exported(editor).options?.map((option) => option.value)).toEqual([1, 2]);
  } finally {
    editor.dispose();
  }
});

test("reset messages describe exclusive numeric limits without including the boundary", () => {
  const editor = setup({
    id: "amount",
    type: "question",
    kind: "number",
    key: "amount",
    label: "Amount",
    validation: [
      { id: "min", type: "minimum", value: 10, inclusive: false, message: "Custom minimum" },
      { id: "max", type: "maximum", value: 20, inclusive: false, message: "Custom maximum" },
    ],
  });

  try {
    editor.update(
      () => {
        const node = $getRoot()
          .getChildren()
          .find((member) => $native(member).question)!;

        for (const error of nativeErrorMessages($native(node).question!, {
          kind: "number",
          label: "Amount",
          optionCount: 0,
        }))
          $setNativeErrorMessage(node, error, undefined);
      },
      { discrete: true },
    );
    expect(exported(editor).validation?.map((rule) => rule.message)).toEqual([
      "Amount must be more than 10",
      "Amount must be less than 20",
    ]);
  } finally {
    editor.dispose();
  }
});

test("option menu uses native scalar values and typed edits survive JSON export", () => {
  for (const values of [
    [0, 5, 2],
    [false, true, false],
    ["0", "5", "2"],
  ] as const) {
    const editor = setup({
      id: "choice",
      type: "question",
      kind: "choice",
      key: "choice",
      label: "Choice",
      config: { selection: "single" },
      options: [
        { id: "first", value: values[0], label: "First" },
        { id: "second", value: values[1], label: "Second" },
      ],
    });

    try {
      editor.update(
        () => {
          const node = $getRoot()
            .getChildren()
            .find((member) => $native(member).option?.id === "first")!;

          expect($describe(node.getKey())!.menu.optionValues.map((option) => option.value)).toEqual(
            values.slice(0, 2),
          );
          $setFormSettings(node, { optionValue: parseOptionValue(String(values[2]), values[0]) });
        },
        { discrete: true },
      );
      expect(exported(editor).options?.map((option) => option.value)).toEqual([
        values[2],
        values[1],
      ]);
    } finally {
      editor.dispose();
    }
  }
});

test("option text parsing retains scalar types and rejects invalid or blank replacements", () => {
  expect(parseOptionValue("0.05", 0)).toBe(0.05);
  expect(parseOptionValue("-1.5", 0)).toBe(-1.5);
  expect(parseOptionValue("5.0", 0)).toBe(5);
  expect(parseOptionValue("false", true)).toBe(false);
  expect(parseOptionValue("true", false)).toBe(true);
  expect(parseOptionValue("2", "0")).toBe("2");
  expect(parseOptionValue("false", "true")).toBe("false");
  expect(optionValueError("Infinity", 0)).toBe("Enter a number");
  expect(optionValueError("maybe", true)).toBe("Enter true or false");
  expect(optionValueError("", 0)).toBe("Enter an option value");
  expect(optionValueError("  ", "value")).toBe("Enter an option value");
});

test("email and phone retain editable format messages before an explicit native rule exists", () => {
  for (const kind of ["email", "phone"] as const) {
    const editor = setup({
      id: "contact",
      type: "question",
      kind,
      key: "contact",
      label: "Contact",
    });

    try {
      editor.update(
        () => {
          const node = $getRoot()
            .getChildren()
            .find((member) => $native(member).question)!;

          const error = nativeErrorMessages($native(node).question!, {
            kind,
            label: "Contact",
            optionCount: 0,
          })[0]!;

          expect(error.format).toBe(kind);
          expect(error.pinned).toBe(false);
          $setNativeErrorMessage(node, error, "Check");
          $setNativeErrorMessage(node, error, "Check your contact details");
        },
        { discrete: true },
      );
      expect(exported(editor).validation).toEqual([
        { id: `contact-${kind}`, type: kind, message: "Check your contact details" },
      ]);
      editor.read(() => {
        const node = $getRoot()
          .getChildren()
          .find((member) => $native(member).question)!;

        const errors = nativeErrorMessages($native(node).question!, {
          kind,
          label: "Contact",
          optionCount: 0,
        });

        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toBe("Check your contact details");
        expect(errors[0]!.format).toBeUndefined();
      });
    } finally {
      editor.dispose();
    }
  }
});
