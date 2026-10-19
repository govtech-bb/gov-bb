import { paragraphContent } from "../../src/forms/editor/content-adapters";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTabNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineEditor } from "../../src/editor/core/definition";
import type { EditorModule } from "../../src/editor/core/module";
import { TextModule } from "../../src/editor/modules/text/module";
import { HistoryModule } from "../../src/editor/modules/history/module";
import { govbbFormEditor as legacyFormDefinition } from "../../src/presets/govbb-form";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { defineFormEditor } from "../../src/forms/definition";
import { createFormDraftCodec, initialDraft, SourceError } from "../helpers/default-form";

const text = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $getRoot().getTextContent(), { editor: editor });

const write = (editor: LexicalEditor, value: string) =>
  editor.update(
    () => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode(value)));
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  );

const serialized = <N extends SerializedLexicalNode>(node: N): SerializedEditorState => ({
  root: { type: "root", version: 1, children: [node], direction: null, format: "", indent: 0 },
});

test("content-only composition initializes a paragraph and reloads text/tab nodes without form state", () => {
  const definition = defineEditor([TextModule(), HistoryModule()]);
  const editor = createHeadlessEditor(definition);

  try {
    expect(
      editor
        .getEditorState()
        .toJSON()
        .root.children.map((node) => node.type),
    ).toEqual(["paragraph"]);
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode("A"),
              $createTabNode(),
              $createTextNode("B"),
            ),
          );
      },
      { discrete: true },
    );
    const state = editor.getEditorState().toJSON();
    const reloaded = createHeadlessEditor(definition, state);

    try {
      expect(reloaded.getEditorState().toJSON()).toEqual(state);
    } finally {
      reloaded.dispose();
    }

    expect(JSON.stringify(state)).not.toContain("form-title");
    expect(JSON.stringify(state)).not.toContain("sourceKey");
  } finally {
    editor.dispose();
  }
});

test("headless lifecycle runs document hooks once, excludes browser hooks, and disposes in reverse order", () => {
  const events: string[] = [];

  const module: EditorModule = {
    key: "lifecycle",
    registrations: [
      {
        key: "first",
        phase: "document",
        register: () => {
          events.push("first");

          return () => {
            events.push("stop-first");
          };
        },
      },
      {
        key: "browser",
        phase: "browser",
        register: () => {
          throw Error("Browser hook ran headlessly");
        },
      },
      {
        key: "second",
        phase: "document",
        register: () => {
          events.push("second");

          return () => {
            events.push("stop-second");
          };
        },
      },
    ],
    $initialize: () => {
      events.push("initialize");
      $getRoot().append($createParagraphNode());
    },
    $normalizeInitial: () => {
      events.push("normalize");
    },
  };

  const definition = defineEditor([TextModule({ initialize: false }), module]);
  const editor = createHeadlessEditor(definition);
  expect(events).toEqual(["first", "second", "initialize", "normalize"]);
  const state = editor.getEditorState().toJSON();
  editor.dispose();
  editor.dispose();
  expect(events.slice(-2)).toEqual(["stop-second", "stop-first"]);
  events.length = 0;
  const loaded = createHeadlessEditor(definition, state);
  expect(events).toEqual(["first", "second", "normalize"]);
  loaded.dispose();
  events.length = 0;
  const raw = createHeadlessEditor(definition, state, { prepare: false });
  expect(events).toEqual(["first", "second"]);
  raw.dispose();
});

test("failed headless registration or preparation cleans up previously registered hooks", () => {
  for (const stage of ["registration", "normalization"]) {
    let cleaned = 0;

    const definition = defineEditor([
      TextModule(),
      {
        key: "failing",
        registrations: [
          {
            key: "resource",
            phase: "document",
            register: () => () => {
              cleaned++;
            },
          },
          ...(stage === "registration"
            ? [
                {
                  key: "broken",
                  phase: "document" as const,
                  register: () => {
                    throw Error("Cannot register");
                  },
                },
              ]
            : []),
        ],
        $normalizeInitial: () => {
          if (stage === "normalization") throw Error("Cannot normalize");
        },
      },
    ]);

    expect(() => createHeadlessEditor(definition)).toThrow(
      stage === "registration" ? "Cannot register" : "Cannot normalize",
    );
    expect(cleaned).toBe(1);
  }
});

test("editors created from one definition keep separate histories and release command ownership", async () => {
  const definition = defineEditor([TextModule(), HistoryModule()]);

  const first = createHeadlessEditor(definition),
    second = createHeadlessEditor(definition);

  try {
    write(first, "First baseline");
    write(second, "Second baseline");
    write(first, "First edit");
    write(second, "Second edit");
    first.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(text(first)).toBe("First baseline");
    expect(text(second)).toBe("Second edit");
    first.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(text(first)).toBe("First edit");
    second.dispose();
    expect(second.dispatchCommand(UNDO_COMMAND, undefined)).toBe(false);
    expect(text(second)).toBe("Second edit");
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("loading saved content establishes the history baseline without an empty-root undo step", async () => {
  const definition = defineEditor([TextModule(), HistoryModule()]);
  const original = createHeadlessEditor(definition);
  write(original, "Saved document");
  const state = original.getEditorState().toJSON();
  original.dispose();
  const loaded = createHeadlessEditor(definition, state);

  try {
    write(loaded, "Edited document");
    loaded.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(loaded.getEditorState().toJSON()).toEqual(state);
    loaded.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(loaded.getEditorState().toJSON()).toEqual(state);
    loaded.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(text(loaded)).toBe("Edited document");
  } finally {
    loaded.dispose();
  }
});

test("raw unsupported form subtypes are rejected before Lexical can replace them with defaults", () => {
  for (const node of [
    { type: "input", kind: "future-input" },
    { type: "option", kind: "future-choice" },
    { type: "widget", widget: "future-widget" },
    { type: "input", $: { kind: "future-input" } },
    { type: "option", $: { kind: "future-choice" } },
    { type: "widget", $: { widget: "future-widget" } },
  ]) {
    const state = serialized({ ...node, version: 1, children: [] });
    const original = JSON.stringify(state);
    expect(() => legacyFormDefinition.validateDocument(state)).toThrow("Unavailable");
    expect(() => createHeadlessEditor(legacyFormDefinition, state)).toThrow("Unavailable");
    expect(() => createFormRuntime(legacyFormDefinition).hydrate(state)).toThrow("Unavailable");
    expect(JSON.stringify(state)).toBe(original);
    expect(() =>
      createFormDraftCodec(createFormRuntime(legacyFormDefinition)).prepareLegacy(state),
    ).toThrow("Unavailable");
  }
});

test("unsupported subtype in Markdown source-state stays recoverable before hydration", () => {
  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Service\n---\n\n# Page\n\n::text[Name]{#name}\n\n:::source-state\n```json\n{"questions":{"name":{"answer":{"state":{"kind":"future-input"}}}}}\n```\n:::\n';

  const runtime = createFormRuntime(legacyFormDefinition),
    codec = createFormDraftCodec(runtime);

  expect(() => codec.prepare(source)).toThrow(SourceError);
  const loaded = initialDraft(source, codec);

  expect(loaded.snapshot.valid).toBe(false);
  expect(loaded.snapshot.recovery?.original).toBe(source);
  expect(
    loaded.snapshot.diagnostics.some((issue) =>
      issue.message.includes("Unavailable input field or block: future-input"),
    ),
  ).toBe(true);
});

test("injected source codec obeys the host's installed nodes and retains original recovery bytes", () => {
  const source =
    "---\nformat: govbb-form\nformatVersion: 2\ntitle: Service\n---\n\n# Page\n\nSome instructions.\n";

  const runtime = createFormRuntime(
    defineFormEditor({
      modules: [TextModule(), { key: "form-paragraph-source", contents: [paragraphContent] }],
    }),
  );

  const codec = createFormDraftCodec(runtime);
  expect(() => codec.prepare(source)).toThrow(SourceError);
  const loaded = initialDraft(source, codec);

  expect(loaded.snapshot.valid).toBe(false);
  expect(loaded.snapshot.recovery?.original).toBe(source);
  expect(
    loaded.snapshot.diagnostics.some((issue) =>
      issue.message.includes("Unsupported node form-title"),
    ),
  ).toBe(true);
  expect(loaded.snapshot.source).toBe(source);
});
