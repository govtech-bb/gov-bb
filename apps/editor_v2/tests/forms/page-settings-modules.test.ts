import { expect, test } from "vitest";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineFormEditor } from "../../src/forms/definition";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { $setFormSettings } from "../../src/forms/editor/form-metadata";
import { TextModule } from "../../src/editor/modules/text/module";
import { WidgetNode } from "../../src/forms/editor/answer-nodes";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createDraftCodec, initialDraft, MARKDOWN_KEY, WORKING_KEY } from "../helpers/default-form";

const source =
  "---\nformat: govbb-form\nformatVersion: 2\ntitle: Page contracts\n---\n\n# First page\n\n::page{#first}\n\n::text[Name]{#name required}\n\n---\n\n# Next page\n\n::page{#next}\n\nSome text\n";

test("form structure declares repetition as a required dependency before a draft can be loaded", () => {
  expect(() =>
    defineFormEditor({
      modules: govbbFormModules.filter((module) => module.key !== "form-repetition"),
    }),
  ).toThrow("requires form-repetition");
});

test("removing pages removes page actions and rejects saved page structure without changing source bytes", () => {
  expect(() =>
    defineFormEditor({ modules: govbbFormModules.filter((module) => module.key !== "form-pages") }),
  ).toThrow("requires form-pages");

  const definition = defineFormEditor({
    modules: [
      TextModule({ browser: false }),
      {
        key: "standalone-widget-family",
        nodes: [{ type: "widget", node: WidgetNode }],
        storageFamilies: [{ type: "widget", property: "widget", defaultValue: "page-break" }],
      },
    ],
  });

  for (const id of [
    "PAGE_BREAK",
    "REPEATING_PAGE",
    "CONFIRMATION_PAGE",
    "CHECK_ANSWERS_PAGE",
    "DECLARATION_PAGE",
  ])
    expect(definition.actions.some((action) => action.id === id)).toBe(false);
  expect(definition.renderers.some((renderer) => renderer.key === "widget:page-break")).toBe(false);
  expect(definition.nodes.some((node) => node.type === "form-title")).toBe(false);
  const parsed = markdownToLexical(source, definition);
  expect(parsed.state).toBeUndefined();
  expect(parsed.original).toBe(source);
  expect(parsed.diagnostics.some((issue) => issue.severity === "fatal")).toBe(true);
  expect(() =>
    definition.validateDocument({
      root: { type: "root", children: [{ type: "widget", widget: "page-break" }] },
    }),
  ).toThrow("page-break");
  expect(() =>
    definition.validateDocument({ root: { type: "root", children: [{ type: "widget" }] } }),
  ).toThrow("page-break");
  const working = source + "\nAn unfinished working edit [\n";

  const values = new Map([
    [MARKDOWN_KEY, source],
    [WORKING_KEY, working],
  ]);

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  const runtime = createFormRuntime(definition);

  const recovery = initialDraft(
    storage,
    () => {
      throw Error("Unavailable pages must not load a demo");
    },
    createDraftCodec(runtime),
    runtime,
  );

  expect(recovery.state).toBeUndefined();
  expect(recovery.snapshot.valid).toBe(false);
  expect(recovery.snapshot.recovery).toEqual({ kind: "markdown", original: source });
  expect(recovery.snapshot.source).toBe(working);
  expect(values.get(MARKDOWN_KEY)).toBe(source);
  expect(values.get(WORKING_KEY)).toBe(working);
  expect(markdownToLexical(source, govbbFormEditor).state).toBeDefined();
});

test("form metadata mutations respect readonly state and belong to one editor", () => {
  const state = markdownToLexical(source, govbbFormEditor).state!;

  const first = createHeadlessEditor(govbbFormEditor, state),
    second = createHeadlessEditor(govbbFormEditor, state);

  try {
    const original = first.getEditorState().toJSON();
    const untouched = second.getEditorState().toJSON();
    first.setEditable(false);
    first.update(() => $setFormSettings({ description: "Must not be stored" }), { discrete: true });
    expect(first.getEditorState().toJSON()).toEqual(original);
    first.setEditable(true);
    first.update(() => $setFormSettings({ description: "First editor only" }), { discrete: true });
    expect(first.getEditorState().toJSON()).not.toEqual(original);
    expect(second.getEditorState().toJSON()).toEqual(untouched);
  } finally {
    first.dispose();
    second.dispose();
  }
});
