import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $settings } from "../../src/editor/core/document-state";
import { validatePageSettings } from "../../src/forms/core/pages";
import type { Settings } from "../../src/forms/core/settings";
import {
  nativeFormToSerialized,
  serializedToNativeForm,
} from "../../src/forms/editor/native-bindings";
import { prepareNativeBindings } from "../../src/forms/editor/native-preparation";
import { $setFormSettings } from "../../src/forms/editor/native-settings";
import { $native, rawNative } from "../../src/forms/editor/native-state";
import { syncNativeSource } from "../../src/forms/editor/native-source";
import { $isPageBreak, $pageType } from "../../src/forms/editor/nodes";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import type { AnyFormDefinition } from "../../src/forms/schema/types";
import { jsonSettings, serializedNodes } from "../helpers/serialized-test-data";

const form: AnyFormDefinition = {
  schemaVersion: 2,
  id: "confirmation-settings",
  title: "Confirmation settings",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "draft", hiddenAnswers: "retain" },
  blocks: [
    { id: "details", type: "page", role: "questions", title: "Details" },
    { id: "name", type: "question", kind: "text", key: "name", label: "Your name" },
    { id: "confirmation", type: "page", role: "confirmation", title: "Application submitted" },
  ],
};

test("confirmation uses one editable flag and can be turned off", () => {
  const state = nativeFormToSerialized(form, govbbFormEditor),
    before = structuredClone(state),
    editor = createHeadlessEditor(govbbFormEditor, state);

  try {
    expect(state).toEqual(before);
    editor.read(() => {
      const page = $getRoot().getChildren().find($isPageBreak)!;
      expect($settings(page)).toEqual({ pageId: "confirmation", confirmation: true });
      expect($pageType(page)).toBe("confirmation");
    });
    expect(serializedToNativeForm(editor.getEditorState().toJSON(), govbbFormEditor)).toEqual(form);
    editor.update(
      () => {
        const page = $getRoot().getChildren().find($isPageBreak)!;
        $setFormSettings(page, { confirmation: false });
        expect($pageType(page)).toBe("questions");
        expect($native(page).page?.role).toBe("questions");
        expect($settings(page).pageType).toBeUndefined();
      },
      { discrete: true },
    );
    expect(
      serializedToNativeForm(editor.getEditorState().toJSON(), govbbFormEditor).blocks.at(-1),
    ).toMatchObject({ id: "confirmation", role: "questions" });
  } finally {
    editor.dispose();
  }
});

for (const [name, invalid] of [
  ["unknown purpose flag", { unsupportedPurpose: true }],
  ["unknown page type", { pageType: "unsupported-page" }],
  ["duplicate confirmation representation", { pageType: "confirmation" }],
  ["nonboolean confirmation", { confirmation: "yes" }],
] satisfies [string, Settings][]) {
  test(`${name} is rejected before hydration, preparation, source sync and export`, () => {
    const state = nativeFormToSerialized(form, govbbFormEditor),
      page = state.root.children.find((node) => rawNative(node).page?.id === "confirmation")!;

    page.$!.settings = { pageId: "confirmation", ...invalid };
    const before = JSON.stringify(state);

    expect(() => createHeadlessEditor(govbbFormEditor, state)).toThrow();
    expect(() => syncNativeSource(state)).toThrow();
    expect(() => serializedToNativeForm(state, govbbFormEditor)).toThrow();
    const prepared = prepareNativeBindings(state, govbbFormEditor);
    expect(prepared.state).toBe(state);
    expect(prepared.migrated).toBe(false);
    expect(prepared.diagnostics).toHaveLength(1);
    expect(prepared.diagnostics[0]?.severity).toBe("error");
    expect(JSON.stringify(state)).toBe(before);
  });
}

test("first pages and page breaks with default or stored discriminators share strict settings validation", () => {
  for (const location of ["first", "default", "stored"]) {
    const state = nativeFormToSerialized(form, govbbFormEditor),
      nodes = serializedNodes(state),
      page =
        location === "first"
          ? nodes[0]!
          : nodes.find((node) => rawNative(node).page?.id === "confirmation")!;

    page.$!.settings = { unsupportedPurpose: true };

    if (location !== "first") delete page.widget;

    if (location === "stored") page.$!.widget = "page-break";
    expect(() => createHeadlessEditor(govbbFormEditor, state)).toThrow("Unsupported page setting");
  }
});

test("page validation checks purpose without rewriting nested metadata or unrelated widget settings", () => {
  const settings: Settings = {
    confirmation: false,
    button: "Keep this text",
    sourceUnknown: { unsupportedPurpose: true, pageType: "unsupported-page" },
  };

  const before = structuredClone(settings);
  expect(validatePageSettings(settings)).toBeUndefined();
  expect(settings).toEqual(before);
  expect(validatePageSettings([])).toBe("Page settings must be an object");
  expect(validatePageSettings(null)).toBe("Page settings must be an object");

  const state = nativeFormToSerialized(form, govbbFormEditor),
    question = state.root.children.find((node) => rawNative(node).question?.id === "name")!;

  const opaque: Settings = { unsupportedPurpose: "authored value", pageType: "unsupported-page" };
  question.$!.settings = { ...jsonSettings(question.$!.settings), ...opaque };
  serializedNodes(state).push({
    type: "widget",
    widget: "file-upload",
    version: 1,
    $: { id: "opaque-file", settings: opaque },
  });
  const editor = createHeadlessEditor(govbbFormEditor, state, { prepare: false });

  try {
    const nodes = serializedNodes(editor.getEditorState().toJSON()),
      question = nodes.find((node) => rawNative(node).question?.id === "name")!,
      widget = nodes.find((node) => node.$?.id === "opaque-file")!;

    expect(jsonSettings(question.$?.settings)).toMatchObject(opaque);
    expect(jsonSettings(widget.$?.settings)).toMatchObject(opaque);
  } finally {
    editor.dispose();
  }
});

test("canonical preparation and source sync preserve page identities without migration", () => {
  const state = nativeFormToSerialized(form, govbbFormEditor),
    before = JSON.stringify(state),
    prepared = prepareNativeBindings(state, govbbFormEditor);

  expect(prepared.state).toBe(state);
  expect(prepared.migrated).toBe(false);
  expect(prepared.diagnostics).toEqual([]);
  expect(serializedToNativeForm(syncNativeSource(state), govbbFormEditor)).toEqual(form);
  expect(JSON.stringify(state)).toBe(before);
});
