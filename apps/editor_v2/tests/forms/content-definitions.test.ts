import type { ContentReadContext } from "../../src/forms/legacy";
import { defineLegacyContent } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import { ElementNode, type LexicalNode } from "lexical";
import { defineContent } from "../../src/forms/content";
import { defineFormEditor } from "../../src/forms/definition";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createFormSourceDialect } from "../../src/forms/source/dialect";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { lexicalToLegacySsb } from "../../src/converters/lexicalToLegacySsb";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import {
  createDraftCodec,
  initialDraft,
  MARKDOWN_KEY,
  WORKING_KEY,
  type DraftStorage,
} from "../helpers/default-form";
import type { ContentSourceHandler } from "../../src/forms/source/content";

class NoticeNode extends ElementNode {
  override $config() {
    return this.config("notice-block", { extends: ElementNode });
  }
  override createDOM() {
    return document.createElement("aside");
  }
  override updateDOM() {
    return false;
  }
}

const nodeDefinition = { type: "notice-block", node: NoticeNode };

const notice = (legacy = true) => {
  const declaration: Parameters<typeof defineLegacyContent>[0] = {
    kind: "notice",
    label: "Notice",
    fieldId: () => "notice",
    source: { storage: { type: "notice-block" }, syntax: { type: "directive", name: "notice" } },
  };

  const legacySsb: NonNullable<Parameters<typeof defineLegacyContent>[0]["legacySsb"]> = (
    node: LexicalNode,
    context: ContentReadContext,
  ) => ({
    entry: {
      type: "callout",
      id: context.id,
      fieldId: context.fieldId!,
      variant: "inset",
      markdown: context.markdown,
      hidden: context.hidden,
    },
    covers: [node],
  });

  return defineLegacyContent(legacy ? { ...declaration, legacySsb } : declaration);
};

const configured = (legacy = true) =>
  defineFormEditor({
    modules: [
      ...govbbFormModules,
      { key: "notice", nodes: [nodeDefinition], contents: [notice(legacy)] },
    ],
  });

const source =
  '---\nformat: govbb-form\nformatVersion: 2\ntitle: Notices\n---\n\n# Read this\n\n::page{#notices}\n\n::notice[Keep **these details**.]\n\n---\n\n# Declaration\n\n::page{#declaration type="declaration"}\n\n::checkboxes[Declaration]{#legal required}\n- I confirm the information I have given is correct\n\n---\n\n# Complete\n\n::page{#complete type="confirmation"}\n';

function memory(seed: Record<string, string>): DraftStorage {
  const entries = new Map(Object.entries(seed));

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

const noDemo = () => {
  throw Error("Unavailable content must stay recoverable");
};

test("content syntax ownership rejects duplicate, reserved and invalid directives", () => {
  const make = (kind: string, syntax: ContentSourceHandler["syntax"]) =>
    defineContent({
      kind,
      label: kind,
      source: { storage: { type: "notice-block", property: "kind", value: kind }, syntax },
    });

  for (const pair of [
    [
      make("first", { type: "directive", name: "notice" }),
      make("second", { type: "json", name: "notice" }),
    ],
    [make("first", { type: "heading", level: 2 }), make("second", { type: "heading", level: 2 })],
    [
      make("first", { type: "list", ordered: true }),
      make("second", { type: "list", ordered: true }),
    ],
  ])
    for (const contents of [pair, [...pair].reverse()]) {
      expect(() =>
        defineFormEditor({ modules: [{ key: "notice", nodes: [nodeDefinition], contents }] }),
      ).toThrow("Overlapping content syntax");
    }

  for (const name of [
    "page",
    "repeat-page",
    "hint",
    "error",
    "question",
    "option",
    "source-state",
    "state",
    "form",
    "repeat",
    "Upper",
    "two words",
  ])
    expect(() =>
      defineFormEditor({
        modules: [
          {
            key: "notice",
            nodes: [nodeDefinition],
            contents: [make("custom", { type: "directive", name })],
          },
        ],
      }),
    ).toThrow("Reserved content syntax");
});

test("content definitions freeze detached source metadata and keep converter callbacks", () => {
  const storage = { type: "notice-block" },
    syntax = { type: "directive" as const, name: "notice" },
    properties = ["authored"];

  const declaration = {
    kind: "notice",
    label: "Notice",
    source: {
      storage,
      syntax,
      properties,
      fromNode: (
        _node: Parameters<NonNullable<ContentSourceHandler["fromNode"]>>[0],
        content: Parameters<NonNullable<ContentSourceHandler["fromNode"]>>[1],
      ) => ({ ...content, text: "Original" }),
    },
  };

  const resolved = defineContent(declaration);
  storage.type = "changed";
  syntax.name = "changed";
  properties[0] = "changed";
  declaration.source.fromNode = (_node, content) => ({ ...content, text: "Changed" });
  expect(resolved.source.storage.type).toBe("notice-block");
  expect(resolved.source.syntax).toEqual({ type: "directive", name: "notice" });
  expect(resolved.source.properties).toEqual(["authored"]);
  expect(Object.isFrozen(resolved.source.properties)).toBe(true);
  expect(
    resolved.source.fromNode!(
      { type: "notice-block" },
      { type: "content", kind: "notice", text: "Input" },
    ).text,
  ).toBe("Original");
});

test("a separately declared content node owns Markdown and legacy output without central kind edits", () => {
  const definition = configured(),
    runtime = createFormRuntime(definition),
    codec = createDraftCodec(runtime);

  const prepared = codec.prepare(source),
    editor = createHeadlessEditor(definition, prepared.state, { prepare: false });

  try {
    expect(prepared.state.root.children.some((node) => node.type === "notice-block")).toBe(true);
    const canonical = codec.encode(prepared.state);
    expect(canonical).toContain("::notice[Keep **these details**.]");
    expect(codec.encode(codec.prepare(canonical).state)).toBe(canonical);

    const before = editor.getEditorState().toJSON(),
      output = lexicalToLegacySsb(editor.getEditorState(), definition, editor);

    expect(output.diagnostics).toEqual([]);
    expect(output.schema!.pages[0]!.blocks).toEqual([
      expect.objectContaining({
        type: "callout",
        variant: "inset",
        fieldId: "notice",
        markdown: "Keep **these details**.",
      }),
    ]);
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});

test("content with no output adapter saves and reloads but reports unsupported legacy output", () => {
  const definition = configured(false),
    runtime = createFormRuntime(definition),
    codec = createDraftCodec(runtime);

  const prepared = codec.prepare(source),
    editor = createHeadlessEditor(definition, prepared.state, { prepare: false });

  try {
    expect(codec.encode(prepared.state)).toContain("::notice[");
    const result = lexicalToLegacySsb(editor.getEditorState(), definition, editor);
    expect(result.schema).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-content-output",
        message: expect.stringContaining("Notice"),
      }),
    ]);
    expect(result.diagnostics[0]!.where).toBeTruthy();
    expect(editor.getEditorState().toJSON()).toEqual(prepared.state);
  } finally {
    editor.dispose();
  }
});

test("removing a content module retains canonical and working source for recovery", () => {
  const full = configured(),
    runtime = createFormRuntime(full),
    codec = createDraftCodec(runtime);

  const canonical = codec.encode(codec.prepare(source).state),
    working = canonical + "\nUnapplied edit\n";

  const absent = defineFormEditor({ modules: govbbFormModules }),
    absentRuntime = createFormRuntime(absent);

  const storage = memory({ [MARKDOWN_KEY]: canonical, [WORKING_KEY]: working });
  const loaded = initialDraft(storage, noDemo, createDraftCodec(absentRuntime), absentRuntime);
  expect(loaded.snapshot.valid).toBe(false);
  expect(loaded.state).toBeUndefined();
  expect(loaded.snapshot.recovery?.original).toBe(canonical);
  expect(loaded.snapshot.source).toBe(working);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(canonical);
  expect(storage.getItem(WORKING_KEY)).toBe(working);
  const restored = initialDraft(storage, noDemo, codec, runtime);
  expect(restored.snapshot.valid).toBe(true);
  expect(restored.snapshot.source).toBe(working);
  expect(restored.snapshot.dirty).toBe(true);
});

test("retained NodeState cannot conceal an unavailable content subtype", () => {
  const base = govbbFormModules
    .filter((module) => !module.registry)
    .map((module) => ({
      ...module,
      contents: module.contents?.filter((content) => content.kind !== "logic"),
    }));

  const definition = defineFormEditor({ modules: base });

  const hidden =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Rules\n---\n\n# Rules\n\n::page{#rules}\n\n:::calculated-fields{#calculated}\n```json\n{}\n```\n:::\n\n:::source-state\n```json\n{"nodes":{"calculated":{"state":{"widget":"conditional-logic"}}}}\n```\n:::\n';

  const dialect = createFormSourceDialect(
    definition.fields.map((field) => field.source),
    definition.contents.map((content) => content.source),
  );

  const parsed = dialect.readMarkdown(hidden);
  expect(parsed.diagnostics).toEqual([]);
  const raw = dialect.toEditor(parsed.document!);
  expect(raw.root.children.find((node) => node.type === "widget")).toMatchObject({
    widget: "calculated-fields",
    $: { widget: "conditional-logic" },
  });
  expect(() => definition.validateDocument(raw)).toThrow("conditional-logic");
  const recovered = markdownToLexical(hidden, definition);
  expect(recovered.state).toBeUndefined();
  expect(recovered.original).toBe(hidden);
  expect(
    recovered.diagnostics.some(
      (issue) => issue.severity === "fatal" && issue.message.includes("conditional-logic"),
    ),
  ).toBe(true);
});

test("content directives cannot capture an installed answer's syntax", () => {
  for (const name of ["text", "file-upload"]) {
    const content = defineContent({
      kind: "notice",
      label: "Notice",
      source: { storage: { type: "notice-block" }, syntax: { type: "directive", name } },
    });

    expect(() =>
      defineFormEditor({
        modules: [
          ...govbbFormModules,
          { key: "notice", nodes: [nodeDefinition], contents: [content] },
        ],
      }),
    ).toThrow();
  }
});
