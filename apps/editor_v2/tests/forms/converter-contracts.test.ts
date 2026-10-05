import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { $getRoot, createEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineFormEditor } from "../../src/forms/definition";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createDraftCodec } from "../../src/forms/editor/codec";
import { $installedFields } from "../../src/forms/editor/field-context";
import { $isInput } from "../../src/forms/editor/nodes";
import {
  $fieldArrayMenu,
  $hasRepetition,
  $pageRepeat,
} from "../../src/forms/features/repetition/queries";
import { validateContentSyntax } from "../../src/forms/source/content";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import { normalizeMigrationRowIds } from "../helpers/form-editor";

const source =
  "---\nformat: govbb-form\nformatVersion: 2\ntitle: Converter contracts\n---\n\n# First page\n\n::page{#first}\n\n::text[Name]{#name required}\n";

test("question directives cannot claim structural syntax, while numbered content and number questions remain distinct", () => {
  for (const kind of ["page", "empty", "hint", "error", "source-state", "repeat-page"])
    expect(() => validateContentSyntax([], [kind])).toThrow(`Reserved field syntax: ${kind}`);
  expect(() =>
    validateContentSyntax(
      [
        {
          kind: "number",
          storage: { type: "numbered-list", property: "kind", value: "number" },
          syntax: { type: "list", ordered: true },
        },
      ],
      ["number"],
    ),
  ).not.toThrow();
});

test("form queries require their installed editor context instead of selecting a default preset", () => {
  const unmanaged = createEditor({
    onError: (error) => {
      throw error;
    },
  });

  expect(() => unmanaged.read($installedFields)).toThrow("no installed definition");

  const editor = createHeadlessEditor(
    govbbFormEditor,
    markdownToLexical(source, govbbFormEditor).state!,
  );

  try {
    const state = editor.getEditorState();
    expect(() => state.read($installedFields)).toThrow();
    expect(state.read($installedFields, { editor })).toBe(govbbFormEditor.fields);
  } finally {
    editor.dispose();
  }
});

test("repetition follows the provided capability even when its implementation module is renamed", () => {
  const definition = defineFormEditor({
    modules: govbbFormModules.map((module) =>
      module.key === "form-repetition" ? { ...module, key: "custom-repetition-provider" } : module,
    ),
  });

  expect(definition.moduleKeys).not.toContain("form-repetition");
  expect(definition.capabilities).toContain("form-repetition");
  expect(Object.isFrozen(definition.capabilities)).toBe(true);
  const editor = createHeadlessEditor(definition, markdownToLexical(source, definition).state!);

  try {
    editor.read(() => {
      expect($hasRepetition()).toBe(true);
      expect($pageRepeat($getRoot().getFirstChild()!)).toBeDefined();
      expect($fieldArrayMenu($getRoot().getChildren().find($isInput)!)).toBeDefined();
    });
  } finally {
    editor.dispose();
  }
});

test("public Markdown conversion and the injected draft codec share one prepared canonical pipeline", async () => {
  const codec = createDraftCodec(createFormRuntime(govbbFormEditor));

  const canonical = await readFile(
    new URL("../fixtures/forms/field-logic-draft.canonical.md", import.meta.url),
    "utf8",
  );

  const result = markdownToLexical(canonical, govbbFormEditor);
  expect(result.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
  expect(result.state).toBeDefined();
  const prepared = codec.prepare(canonical);
  expect(prepared.state).toEqual(result.state!);
  expect(lexicalToMarkdown(result.state!, govbbFormEditor)).toBe(canonical);
  expect(prepared.source).toBe(canonical);
  expect(codec.prepare(prepared.source)).toEqual(prepared);
  const unsupported = source.replace("::text[Name]", "::uninstalled-answer[Name]");
  const rejected = markdownToLexical(unsupported, govbbFormEditor);
  expect(rejected.original).toBe(unsupported);
  expect(rejected.state).toBeUndefined();
  expect(rejected.diagnostics.some((issue) => issue.severity === "fatal")).toBe(true);
  expect(() => codec.prepare(unsupported)).toThrow("Correct the source errors");
});

test("the public Markdown converter migrates version 1 once and preserves canonical source", async () => {
  const legacy = await readFile(
    new URL("../../scripts/browser/fixtures/legacy-markdown-v1.md", import.meta.url),
    "utf8",
  );

  const expected = await readFile(
    new URL("../fixtures/forms/legacy-v1.canonical.md", import.meta.url),
    "utf8",
  );

  const result = markdownToLexical(legacy, govbbFormEditor);
  expect(result.migrated).toBe(true);
  expect(result.original).toBe(legacy);
  const canonical = lexicalToMarkdown(result.state!, govbbFormEditor);
  expect(normalizeMigrationRowIds(canonical)).toBe(expected);
  const reloaded = markdownToLexical(canonical, govbbFormEditor);
  expect(reloaded.migrated).toBeUndefined();
  expect(lexicalToMarkdown(reloaded.state!, govbbFormEditor)).toBe(canonical);
});
