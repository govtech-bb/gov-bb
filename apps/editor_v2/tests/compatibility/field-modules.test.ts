import { readFile } from "node:fs/promises";
import { defineLegacyField } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import { $getRoot, $isElementNode, REDO_COMMAND, UNDO_COMMAND, type LexicalNode } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { executeAction, $availableActions } from "../../src/editor/core/actions";
import { registerEditorHistory } from "../../src/editor/core/history";
import { defineFormEditor } from "../../src/forms/definition";
import { defineField } from "../../src/forms/field";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createFormSourceDialect } from "../../src/forms/source/dialect";
import { readFormState } from "../../src/forms/editor/context";
import { fieldModule } from "../../src/forms/editor/field-module";
import { $createDrawnInput } from "../../src/forms/editor/field-nodes";
import { $fields } from "../../src/forms/features/logic/queries";
import { comparisons } from "../../src/forms/features/logic/comparisons";
import { $mentionable } from "../../src/forms/features/mentions/editor";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import { lexicalToLegacySsb } from "../../src/converters/lexicalToLegacySsb";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import {
  createDraftCodec,
  initialDraft,
  LEGACY_KEY,
  MARKDOWN_KEY,
  WORKING_KEY,
  type DraftStorage,
} from "../helpers/default-form";

const fileSource =
  "---\nformat: govbb-form\nformatVersion: 2\ntitle: Evidence\n---\n\n# Upload evidence\n\n::page{#evidence-page}\n\n::file-upload[Evidence]{#evidence required}\n";

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
  throw Error("An unsupported draft must not become a demo");
};

const withoutFile = () =>
  defineFormEditor({
    modules: govbbFormModules.filter(
      (module) => module.key !== "field:file-upload" && !module.registry,
    ),
  });

const keys = () => {
  const visit = (node: LexicalNode): string[] => [
    node.getKey(),
    ...($isElementNode(node) ? node.getChildren().flatMap(visit) : []),
  ];

  return visit($getRoot());
};

test("removing one field module removes its actions, renderer, inspector and source capability", () => {
  const removed = govbbFormModules.find((module) => module.key === "field:file-upload")!;
  const configured = withoutFile();
  expect(removed).toBeDefined();
  expect(removed.actions?.map((action) => action.id)).toEqual([
    "question_FILE_UPLOAD",
    "FILE_UPLOAD",
  ]);
  expect(removed.renderers?.some((renderer) => renderer.key === "widget:file-upload")).toBe(true);
  expect(removed.slots?.length).toBeGreaterThan(0);
  expect(configured.fields.some((field) => field.kind === "file-upload")).toBe(false);
  expect(configured.fields.some((field) => field.kind === "text")).toBe(true);

  for (const action of removed.actions!)
    expect(configured.actions.some((installed) => installed.id === action.id)).toBe(false);

  for (const renderer of removed.renderers!)
    expect(configured.renderers.some((installed) => installed.key === renderer.key)).toBe(false);

  for (const slot of removed.slots!)
    expect(configured.slots.some((installed) => installed.key === slot.key)).toBe(false);
  expect(configured.actions.some((action) => action.id === "question_INPUT_TEXT")).toBe(true);
  const parsed = markdownToLexical(fileSource, configured);
  expect(parsed.state).toBeUndefined();
  expect(parsed.original).toBe(fileSource);
  expect(
    parsed.diagnostics.some(
      (issue) => issue.severity === "fatal" && issue.message.includes("file-upload"),
    ),
  ).toBe(true);
});

test("uninstalled canonical fields recover original and working Markdown bytes, then load after reinstatement", () => {
  const working = fileSource + "\nUnfinished source [\n";
  const storage = memory({ [MARKDOWN_KEY]: fileSource, [WORKING_KEY]: working });
  const runtime = createFormRuntime(withoutFile());
  const loaded = initialDraft(storage, noDemo, createDraftCodec(runtime), runtime);
  expect(loaded.snapshot.valid).toBe(false);
  expect(loaded.state).toBeUndefined();
  expect(loaded.needsSave).toBe(false);
  expect(loaded.snapshot.recovery).toEqual({ kind: "markdown", original: fileSource });
  expect(loaded.snapshot.source).toBe(working);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(fileSource);
  expect(storage.getItem(WORKING_KEY)).toBe(working);
  const restoredRuntime = createFormRuntime(govbbFormEditor);

  const restored = initialDraft(
    storage,
    noDemo,
    createDraftCodec(restoredRuntime),
    restoredRuntime,
  );

  expect(restored.snapshot.valid).toBe(true);
  expect(restored.snapshot.source).toBe(working);
  expect(restored.snapshot.dirty).toBe(true);
  expect(restored.state).toBeDefined();
  expect(storage.getItem(MARKDOWN_KEY)).toBe(fileSource);
  expect(storage.getItem(WORKING_KEY)).toBe(working);
});

test("installed logic syntax cannot conceal an unavailable field in retained raw NodeState", () => {
  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Rules\n---\n\n# Rules\n\n::page{#rules}\n\n:::logic{#rule}\n```json\n{}\n```\n:::\n\n:::source-state\n```json\n{"nodes":{"rule":{"state":{"widget":"file-upload"}}}}\n```\n:::\n';

  const definition = withoutFile();

  const dialect = createFormSourceDialect(
    definition.fields.map((field) => field.source),
    definition.contents.map((content) => content.source),
  );

  const syntax = dialect.readMarkdown(source);
  expect(syntax.diagnostics).toEqual([]);
  expect(syntax.document).toBeDefined();
  const raw = dialect.toEditor(syntax.document!);
  expect(raw.root.children.find((node) => node.type === "widget")).toMatchObject({
    widget: "conditional-logic",
    $: { widget: "file-upload" },
  });
  expect(() => definition.validateDocument(raw)).toThrow(
    "Unavailable widget field or block: file-upload",
  );
  const parsed = markdownToLexical(source, definition);
  expect(parsed.state).toBeUndefined();
  expect(parsed.diagnostics).toEqual([
    expect.objectContaining({
      code: "source-load",
      severity: "fatal",
      message: expect.stringContaining("file-upload"),
    }),
  ]);
  expect(parsed.original).toBe(source);

  const working = source + "\nWorking copy\n",
    storage = memory({ [MARKDOWN_KEY]: source, [WORKING_KEY]: working });

  const runtime = createFormRuntime(definition),
    loaded = initialDraft(storage, noDemo, createDraftCodec(runtime), runtime);

  expect(loaded.snapshot.recovery?.original).toBe(source);
  expect(loaded.snapshot.source).toBe(working);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(source);
  expect(storage.getItem(WORKING_KEY)).toBe(working);
});

test("raw JSON drafts with an unavailable field stay byte-exact and can load when its module returns", () => {
  const fullRuntime = createFormRuntime(govbbFormEditor),
    fullCodec = createDraftCodec(fullRuntime);

  const raw = JSON.stringify(fullCodec.prepare(fileSource).state, null, 3) + "\n";

  const working = "A retained source edit\n",
    storage = memory({ [LEGACY_KEY]: raw, [WORKING_KEY]: working });

  const definition = withoutFile(),
    runtime = createFormRuntime(definition);

  const loaded = initialDraft(storage, noDemo, createDraftCodec(runtime), runtime);
  expect(loaded.snapshot.valid).toBe(false);
  expect(loaded.snapshot.recovery).toEqual({ kind: "legacy", original: raw });
  expect(loaded.snapshot.diagnostics.some((issue) => issue.message.includes("file-upload"))).toBe(
    true,
  );
  expect(loaded.snapshot.source).toBe(working);
  expect(storage.getItem(LEGACY_KEY)).toBe(raw);
  expect(storage.getItem(MARKDOWN_KEY)).toBeNull();
  expect(storage.getItem(WORKING_KEY)).toBe(working);
  const restored = initialDraft(storage, noDemo, fullCodec, fullRuntime);
  expect(restored.snapshot.valid).toBe(true);
  expect(restored.state).toBeDefined();
  expect(restored.snapshot.source).toBe(working);
  expect(storage.getItem(LEGACY_KEY)).toBe(raw);
  expect(storage.getItem(WORKING_KEY)).toBe(working);
});

test("configured conversion reads existing nodes without changing keys, bytes or the owning editor", async () => {
  const source = await readFile(
    new URL("../fixtures/forms/demo.canonical.md", import.meta.url),
    "utf8",
  );

  const baseline = JSON.parse(
    await readFile(new URL("../fixtures/forms/demo.legacy-ssb.json", import.meta.url), "utf8"),
  );

  const runtime = createFormRuntime(govbbFormEditor),
    codec = createDraftCodec(runtime);

  const prepared = codec.prepare(source);
  const editor = createHeadlessEditor(govbbFormEditor, prepared.state, { prepare: false });
  const other = createHeadlessEditor(withoutFile(), undefined, { prepare: false });

  try {
    const state = editor.getEditorState(),
      bytes = JSON.stringify(state.toJSON()),
      originalKeys = state.read(keys);

    expect(readFormState(state, govbbFormEditor, keys)).toEqual(originalKeys);
    expect(readFormState(state, govbbFormEditor, keys, editor)).toEqual(originalKeys);
    expect(() => readFormState(state, govbbFormEditor, keys, other)).toThrow(
      "installed definition",
    );
    const standalone = lexicalToLegacySsb(state, govbbFormEditor);
    const live = lexicalToLegacySsb(state, govbbFormEditor, editor);
    expect(standalone.diagnostics).toEqual([]);
    expect(JSON.parse(JSON.stringify(standalone.schema))).toEqual(baseline.schema);
    expect(live).toEqual(standalone);
    expect(lexicalToMarkdown(state.toJSON(), govbbFormEditor)).toBe(source);
    expect(state.read(keys)).toEqual(originalKeys);
    expect(JSON.stringify(state.toJSON())).toBe(bytes);
    expect(editor.getEditorState()).toBe(state);
    expect(other.getEditorState().toJSON().root.children).toEqual([]);
  } finally {
    editor.dispose();
    other.dispose();
  }
});

test("an installed field without a legacy SSB adapter saves source and reports unavailable output explicitly", () => {
  const custom = defineField({
    kind: "account-code",
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    source: { storage: { type: "input", property: "kind", value: "account-code" } },
    settings: { defaults: {}, read: (raw) => ({ code: String(raw.code ?? "") }) },
    capabilities: { hideLabel: true, repeat: false, comparisons: [], formula: false },
  });

  const definition = defineFormEditor({
    modules: [...govbbFormModules, { key: "field:account-code", fields: [custom] }],
  });

  const source =
    "---\nformat: govbb-form\nformatVersion: 2\ntitle: Accounts\n---\n\n# Account\n\n::page{#account-page}\n\n::account-code[Account code]{#account}\n";

  const runtime = createFormRuntime(definition),
    codec = createDraftCodec(runtime);

  const prepared = codec.prepare(source),
    editor = createHeadlessEditor(definition, prepared.state, { prepare: false });

  try {
    expect(codec.encode(prepared.state)).toContain("::account-code[Account code]");
    const result = lexicalToLegacySsb(editor.getEditorState(), definition, editor);
    expect(result.schema).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-field-output",
        where: "account",
        message: expect.stringContaining("Account code"),
      }),
    ]);
    expect(editor.getEditorState().toJSON()).toEqual(prepared.state);
  } finally {
    editor.dispose();
  }
});

test("a host-defined field inserts through a registered action, retains typed source and SSB settings, and undoes once", async () => {
  const custom = defineLegacyField({
    kind: "account-code",
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    source: {
      storage: { type: "input", property: "kind", value: "account-code" },
      attributes: { code: "string", enabled: "boolean" },
    },
    settings: {
      defaults: { required: true, code: "007", enabled: false, fieldId: "account-code" },
      read: (raw) => ({ code: String(raw.code ?? ""), enabled: raw.enabled === true }),
    },
    capabilities: { hideLabel: true, repeat: false, comparisons: ["IS_EMPTY"], formula: false },
    legacySsb: {
      ref: "components/account-code",
      settings: (settings) => ({ accountCode: settings.code, accountEnabled: settings.enabled }),
      rules: () => [],
    },
  });

  const module = fieldModule({
    field: custom,
    Controls: () => null,
    Preview: () => null,
    insertion: {
      id: "ACCOUNT_CODE",
      order: 50,
      create: () => [$createDrawnInput(custom.kind, custom.defaults)],
      question: { description: "Enter an account code.", label: "Account code" },
      answer: { description: "Account code input." },
    },
  });

  const definition = defineFormEditor({ modules: [...govbbFormModules, module] });

  const runtime = createFormRuntime(definition),
    codec = createDraftCodec(runtime);

  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Accounts\n---\n\n# Account\n\n::page{#accounts}\n\n::title[Account code]\n\n---\n\n# Declaration\n\n::page{#declaration type="declaration"}\n\n::checkboxes[Declaration]{#legal required}\n- I confirm the information I have given is correct\n\n---\n\n# Application complete\n\n::page{#complete type="confirmation"}\n';

  expect(
    markdownToLexical(source, definition).diagnostics.filter((issue) => issue.severity === "fatal"),
  ).toEqual([]);
  const editor = createHeadlessEditor(definition, codec.prepare(source).state, { prepare: false });
  // Legacy browser registrations are excluded headlessly, so install the same history owner once.
  const stopHistory = registerEditorHistory(editor);

  try {
    const baseline = editor.getEditorState().toJSON();

    const targetKey = editor.getEditorState().read(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => node.getType() === "question")!
          .getKey(),
      { editor: editor },
    );

    expect(
      editor
        .getEditorState()
        .read(
          () =>
            $availableActions(editor, definition, { targetKey }).some(
              (action) => action.id === "ACCOUNT_CODE",
            ),
          { editor },
        ),
    ).toBe(true);
    expect(executeAction(editor, definition, "ACCOUNT_CODE", { targetKey }).executed).toBe(true);
    const inserted = editor.getEditorState().toJSON();
    expect(inserted.root.children.find((node) => node.type === "input")).toMatchObject({
      $: { settings: { enabled: false } },
    });
    const emitted = codec.encode(inserted);
    expect(emitted).toContain("::account-code[Account code]");
    expect(emitted).toContain('code="007"');
    expect(emitted).toContain('enabled="false"');
    const prepared = codec.prepare(emitted);
    expect(codec.encode(prepared.state)).toBe(emitted);
    const result = lexicalToLegacySsb(editor.getEditorState(), definition, editor);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.schema!.pages[0]!.blocks.find((block) => block.type === "question"),
    ).toMatchObject({
      kind: "account-code",
      ref: "components/account-code",
      settings: { accountCode: "007", accountEnabled: false },
    });
    const logicField = editor.getEditorState().read(() => $fields()[0]!, { editor });
    // Menus call this after the editor read has ended; captured capabilities must survive that boundary.
    expect(comparisons(logicField)).toEqual(["IS_EMPTY"]);
    expect(logicField.capabilities?.formula).toBe(false);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(baseline);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(inserted);
    expect(codec.encode(editor.getEditorState().toJSON())).toBe(emitted);
  } finally {
    stopHistory();
    editor.dispose();
  }
});

test("mention eligibility uses the installed field capability and preserves opening-hours behavior", () => {
  for (const mention of [false, true]) {
    const custom = defineField({
      kind: "account-code",
      label: "Account code",
      untitled: "Untitled account code",
      gutterOffset: 11,
      source: { storage: { type: "input", property: "kind", value: "account-code" } },
      settings: { defaults: {}, read: () => ({}) },
      capabilities: { hideLabel: true, repeat: false, comparisons: [], formula: false, mention },
    });

    const definition = defineFormEditor({
      modules: [...govbbFormModules, { key: "field:account-code", fields: [custom] }],
    });

    const source =
      "---\nformat: govbb-form\nformatVersion: 2\ntitle: Accounts\n---\n\n# Account\n\n::page{#accounts}\n\n::text[Name]{#name}\n\n::file-upload[Evidence]{#evidence}\n\n::opening-hours[Opening hours]{#hours}\n\n::account-code[Account code]{#account}\n\nYour details:\n";

    const runtime = createFormRuntime(definition),
      codec = createDraftCodec(runtime);

    const editor = createHeadlessEditor(definition, codec.prepare(source).state, {
      prepare: false,
    });

    try {
      editor.update(
        () => {
          const paragraph = $getRoot().getLastChildOrThrow();

          if (!$isElementNode(paragraph)) throw Error("Expected a paragraph after the fields");
          paragraph.selectEnd();
        },
        { discrete: true },
      );
      expect(
        editor.getEditorState().read(() => $mentionable().map((field) => field.kind), { editor }),
      ).toEqual(["text", "opening-hours", ...(mention ? ["account-code"] : [])]);
    } finally {
      editor.dispose();
    }
  }
});

test("a removed long-answer module rejects its own node before headless hydration", () => {
  const codec = createDraftCodec(createFormRuntime(govbbFormEditor));
  const source = fileSource.replace("::file-upload", "::long-answer");
  const saved = codec.prepare(source).state;

  const withoutLong = defineFormEditor({
    modules: govbbFormModules.filter(
      (module) => module.key !== "field:long-answer" && !module.registry,
    ),
  });

  expect(withoutLong.nodes.some((node) => node.type === "long-answer")).toBe(false);
  expect(() => withoutLong.validateDocument(saved)).toThrow("Unsupported node long-answer");
  expect(() => createHeadlessEditor(withoutLong, saved)).toThrow("Unsupported node long-answer");
  const editor = createHeadlessEditor(govbbFormEditor, saved, { prepare: false });

  try {
    expect(editor.getEditorState().toJSON()).toEqual(saved);
  } finally {
    editor.dispose();
  }
});
