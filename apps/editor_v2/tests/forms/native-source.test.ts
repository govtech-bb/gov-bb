import { jsonSettings } from "../helpers/serialized-test-data";
import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { $native } from "../../src/forms/editor/native-state";
import { $toggleHidden } from "../../src/forms/editor/nodes";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import {
  nativeFormToSerialized,
  serializedToNativeForm,
} from "../../src/forms/editor/native-bindings";
import { rawNative } from "../../src/forms/editor/native-state";
import { syncNativeSource } from "../../src/forms/editor/native-source";
import { nativeSemanticEqual } from "../../src/forms/schema/semantics";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import type { AnyFormDefinition } from "../../src/forms/schema/types";

const form: AnyFormDefinition = {
  schemaVersion: 2,
  id: "source-controls",
  title: "Source controls",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "preview", hiddenAnswers: "retain" },
  blocks: [
    { id: "questions", type: "page", role: "questions", title: "Questions" },
    {
      id: "amount",
      type: "question",
      kind: "number",
      key: "amount",
      label: "Amount",
      required: { value: true, message: "Enter the amount" },
      default: 0,
      config: { width: "short" },
    },
    {
      id: "choice",
      type: "question",
      kind: "choice",
      key: "choice",
      label: "Choose a number",
      config: { selection: "single" },
      options: [
        { id: "zero", value: 0, label: "Zero" },
        { id: "two", value: 2, label: "Two" },
      ],
    },
    {
      id: "total",
      type: "calculated",
      valueType: "number",
      expression: { op: "multiply", args: [{ answer: "amount" }, 2] },
    },
    {
      id: "rules",
      type: "logic",
      rules: [
        {
          id: "always",
          when: true,
          actions: [{ type: "setRequired", target: "amount", value: false }],
        },
      ],
    },
    { id: "confirmation", type: "page", role: "confirmation", title: "Confirmation" },
  ],
};

test("source sync preserves native omissions and false/zero values without modifying input", () => {
  const state = nativeFormToSerialized(form, govbbFormEditor),
    before = structuredClone(state);

  const synced = syncNativeSource(state);
  expect(state).toEqual(before);
  expect(nativeSemanticEqual(serializedToNativeForm(synced, govbbFormEditor), form)).toBe(true);
});

test("editable source settings update native payloads while preserving identities and errors", () => {
  const state = nativeFormToSerialized(form, govbbFormEditor),
    nodes = state.root.children;

  const question = nodes.find((node) => rawNative(node).question?.id === "amount")!;
  question.$!.settings = {
    ...jsonSettings(question.$!.settings),
    required: false,
    width: "long",
    defaultAnswer: 10,
  };
  const option = nodes.find((node) => rawNative(node).option?.id === "zero")!;
  option.$!.settings = { ...jsonSettings(option.$!.settings), optionValue: "3" };
  const calculated = nodes.find((node) => rawNative(node).calculated)!;
  calculated.$!.settings = {
    native: {
      ...rawNative(calculated).calculated!,
      expression: { op: "multiply", args: [{ answer: "amount" }, 5] },
    },
  };
  const logic = nodes.find((node) => rawNative(node).logic)!;
  logic.$!.settings = {
    native: {
      ...rawNative(logic).logic!,
      rules: [
        {
          id: "always",
          when: true,
          actions: [{ type: "setRequired", target: "amount", value: true }],
        },
      ],
    },
  };
  const exported = serializedToNativeForm(syncNativeSource(state), govbbFormEditor);
  expect(exported.blocks.find((block) => block.id === "amount")).toMatchObject({
    id: "amount",
    key: "amount",
    required: { value: false, message: "Enter the amount" },
    default: 10,
    config: { width: "long" },
  });
  expect(exported.blocks.find((block) => block.id === "choice")).toMatchObject({
    options: [
      { id: "zero", value: 3 },
      { id: "two", value: 2 },
    ],
  });
  expect(exported.blocks.find((block) => block.id === "total")).toMatchObject({
    expression: { op: "multiply", args: [{ answer: "amount" }, 5] },
  });
  expect(exported.blocks.find((block) => block.id === "rules")).toMatchObject({
    rules: [{ actions: [{ value: true }] }],
  });
});

test("omitting the source field alias preserves a submitted key while an explicit blank remains repairable", () => {
  const state = nativeFormToSerialized(form, govbbFormEditor);

  const question = state.root.children.find((node) => rawNative(node).question?.id === "amount")!;

  const settings = jsonSettings(question.$!.settings);
  question.$!.settings = settings;
  delete settings.fieldId;
  expect(
    serializedToNativeForm(syncNativeSource(state), govbbFormEditor).blocks.find(
      (block) => block.id === "amount",
    ),
  ).toMatchObject({ key: "amount" });
  settings.fieldId = "";
  const synced = syncNativeSource(state);
  expect(
    rawNative(synced.root.children.find((node) => rawNative(node).question?.id === "amount")!)
      .question?.key,
  ).toBe("");
});

test("malformed native source fences stay visible instead of reviving cached valid rules", () => {
  const state = nativeFormToSerialized(form, govbbFormEditor);
  const logic = state.root.children.find((node) => rawNative(node).logic)!;
  logic.$!.settings = { native: { rules: null, inactiveFutureValue: false } };
  const result = syncNativeSource(state);

  const retained = result.root.children.find((node) => node.$?.id === logic.$!.id)!;

  expect(
    nativeSemanticEqual(rawNative(retained).logic, { rules: null, inactiveFutureValue: false }),
  ).toBe(true);
  expect(() => serializedToNativeForm(result, govbbFormEditor)).toThrow("valid logic payload");
  expect(rawNative(logic).logic?.rules).toHaveLength(1);
});

test("editing readable Markdown attributes changes the exported native question", () => {
  const editor = createHeadlessEditor(
    govbbFormEditor,
    nativeFormToSerialized(form, govbbFormEditor),
  );

  try {
    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);

    const changed = source
      .replace('width="short"', 'width="long"')
      .replace(/(\? Amount\n[^\n]*?) required(?=[ }])/, '$1 required="false"');

    expect(changed).not.toBe(source);
    const parsed = markdownToLexical(changed, govbbFormEditor);
    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.state).toBeDefined();

    if (!parsed.state) return;
    const result = serializedToNativeForm(syncNativeSource(parsed.state), govbbFormEditor);
    expect(result.blocks.find((block) => block.id === "amount")).toMatchObject({
      config: { width: "long" },
    });
  } finally {
    editor.dispose();
  }
});

test("hiding and showing a native question preserves label visibility through Markdown reload", () => {
  const editor = createHeadlessEditor(
    govbbFormEditor,
    nativeFormToSerialized(form, govbbFormEditor),
  );

  try {
    for (const visible of [false, true]) {
      editor.update(
        () => {
          const label = $getRoot()
            .getChildren()
            .find((node) => {
              const native = $native(node);

              return native.owner === "amount" && native.part === "label";
            });

          if (!label) throw new Error("Question label was not imported");
          $toggleHidden(label);
        },
        { discrete: true },
      );
      const before = serializedToNativeForm(editor.getEditorState().toJSON(), govbbFormEditor);
      expect(before.blocks.find((block) => block.id === "amount")).toMatchObject({
        visible,
        parts: { label: { visible } },
      });
      const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);
      const parsed = markdownToLexical(source, govbbFormEditor);
      expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);

      if (!parsed.state) throw new Error("Native question source did not parse");
      const reopened = createHeadlessEditor(govbbFormEditor, parsed.state);

      try {
        expect(serializedToNativeForm(reopened.getEditorState().toJSON(), govbbFormEditor)).toEqual(
          before,
        );
      } finally {
        reopened.dispose();
      }
    }
  } finally {
    editor.dispose();
  }
});
