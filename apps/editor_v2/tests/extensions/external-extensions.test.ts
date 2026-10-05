import { serializedNodes } from "../helpers/serialized-test-data";
import { expect, test } from "vitest";
import { $getRoot, HISTORY_PUSH_TAG, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import {
  $setSettings,
  createHeadlessEditor,
  defineEditor,
  executeAction,
  HistoryModule,
  TextModule,
} from "../../src/editor";
import {
  defineFormEditor,
  FormRegistryModule,
  lexicalToLegacySsb,
  lexicalToMarkdown,
  markdownToLexical,
  prepareRegistryEntry,
} from "../../src/forms";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { NoticeModule } from "./notice-module";
import { NoticeFormModule } from "./notice-form";
import { ReferenceFieldModule, referenceField } from "./reference-field";
import { applicantEntry, applicantRegistry } from "./applicant-preset";
import { nativeHost, nativeOutput } from "../helpers/native-form";

const formModules = [...govbbFormModules, NoticeFormModule(), ReferenceFieldModule()];

const definition = defineFormEditor({
  modules: [...formModules, FormRegistryModule(applicantRegistry, { key: "example:applicants" })],
});

test("public Notice module is ordinary content with owned settings, validation, insertion, undo and JSON reload", () => {
  const content = defineEditor([TextModule(), HistoryModule(), NoticeModule()]);
  expect(content.nodes.some((node) => node.type === "form-title" || node.type === "input")).toBe(
    false,
  );
  const editor = createHeadlessEditor(content);

  try {
    const initial = editor.getEditorState().toJSON();
    const targetKey = editor.read(() => $getRoot().getLastChild()!.getKey());
    expect(executeAction(editor, content, "example-notice", { targetKey }).executed).toBe(true);
    editor.update(
      () => $setSettings($getRoot().getFirstChild()!, { tone: "warning", retained: "literal" }),
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const edited = editor.getEditorState().toJSON();
    const reloaded = createHeadlessEditor(content, edited);

    try {
      expect(reloaded.getEditorState().toJSON()).toEqual(edited);
    } finally {
      reloaded.dispose();
    }

    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).not.toEqual(edited);
    editor.update(() => editor.dispatchCommand(REDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).toEqual(edited);
    expect(edited).not.toEqual(initial);
    const bad = structuredClone(edited);
    serializedNodes(bad)[0]!.$!.settings!.tone = "urgent";
    expect(() => createHeadlessEditor(content, bad)).toThrow("Notice tone");
    expect(() => createHeadlessEditor(defineEditor([TextModule()]), edited)).toThrow(
      "Unsupported node example-notice",
    );
  } finally {
    editor.dispose();
  }
});

test("native-only public field, content and registry compose with independent structural references and editable configuration", () => {
  expect("legacySsb" in referenceField).toBe(false);
  const editor = nativeHost(definition);

  try {
    const instances = [
      prepareRegistryEntry(applicantEntry, definition),
      prepareRegistryEntry(applicantEntry, definition),
    ];

    expect(instances[0]!.identities.some((id) => instances[1]!.identities.includes(id))).toBe(
      false,
    );

    for (let copy = 0; copy < 2; copy++)
      expect(
        executeAction(editor, definition, applicantEntry.key, {
          targetKey: editor.read(() => $getRoot().getLastChild()!.getKey()),
        }).executed,
      ).toBe(true);

    const output = nativeOutput(editor, definition),
      names = output.blocks.filter((block) => block.type === "question" && block.kind === "text"),
      refs = output.blocks.filter(
        (block) => block.type === "question" && block.kind === "reference-code",
      ),
      notices = output.blocks.filter(
        (block) => block.type === "content" && block.kind === "example-notice",
      );

    expect(refs).toHaveLength(2);
    refs.forEach((ref, index) => {
      expect(ref).toMatchObject({
        config: {
          code: "APP",
          peer: names[index]!.id,
          opaque: { literal: "applicant", token: "{{applicant}}" },
        },
      });
      expect(notices[index]).toMatchObject({
        config: { peer: names[index]!.id, literal: "applicant" },
      });
    });
    editor.update(
      () => {
        const input = $getRoot()
          .getChildren()
          .find((node) => {
            const raw = node.exportJSON();

            return "kind" in raw && raw.kind === "reference-code";
          })!;

        $setSettings(input, { code: "NEW" });
      },
      { discrete: true },
    );
    expect(
      nativeOutput(editor, definition).blocks.find(
        (block) => block.type === "question" && block.kind === "reference-code",
      ),
    ).toMatchObject({ config: { code: "NEW" } });

    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), definition),
      parsed = markdownToLexical(source, definition);

    expect(parsed.state).toBeDefined();
    const restored = createHeadlessEditor(definition, parsed.state!);

    try {
      expect(nativeOutput(restored, definition)).toEqual(nativeOutput(editor, definition));
    } finally {
      restored.dispose();
    }

    const legacy = lexicalToLegacySsb(editor.getEditorState(), definition, editor);
    expect(legacy.schema).toBeNull();
    expect(
      legacy.diagnostics.some(
        (issue) =>
          issue.code === "unsupported-field-output" || issue.code === "unsupported-content-output",
      ),
    ).toBe(true);
    const missing = defineFormEditor({ modules: [...govbbFormModules, NoticeFormModule()] });
    const rejected = markdownToLexical(source, missing);
    expect(rejected.state).toBeUndefined();
    expect(rejected.original).toBe(source);
  } finally {
    editor.dispose();
  }
});

test("public native extensions reject malformed configuration, missing module handlers and duplicate registrations", () => {
  expect(() => defineFormEditor({ modules: [...formModules, ReferenceFieldModule()] })).toThrow(
    "Overlapping native fields claims",
  );
  expect(() =>
    defineFormEditor({ modules: [...govbbFormModules, FormRegistryModule(applicantRegistry)] }),
  ).toThrow();

  const invalid = {
    ...applicantEntry,
    blocks: applicantEntry.blocks.map((block) =>
      block.type === "question" && block.kind === "reference-code"
        ? { ...block, config: { code: "invalid" } }
        : block,
    ),
  };

  expect(() => prepareRegistryEntry(invalid, definition)).toThrow("three uppercase");

  const external = {
    ...applicantEntry,
    blocks: applicantEntry.blocks.map((block) =>
      block.type === "question" && block.kind === "reference-code"
        ? { ...block, config: { code: "APP", peer: "missing" } }
        : block,
    ),
  };

  expect(() => prepareRegistryEntry(external, definition)).toThrow("Unknown answer reference");
});

test("custom configuration references can explicitly bind to the native destination", () => {
  const entry = {
    ...applicantEntry,
    externalReferences: ["existing-name"],
    blocks: applicantEntry.blocks
      .filter((block) => block.type === "question" && block.kind === "reference-code")
      .map((block) => ({ ...block, config: { code: "APP", peer: "existing-name" } })),
  };

  const registry = defineFormEditor({
    modules: [
      ...formModules,
      FormRegistryModule({ entries: [entry] }, { key: "external-bindings" }),
    ],
  });

  const editor = nativeHost(registry, {
    schemaVersion: 2,
    id: "existing",
    title: "Existing",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [
      { id: "page", type: "page", role: "questions", title: "Page" },
      {
        id: "existing-name",
        type: "question",
        key: "existing-name",
        kind: "text",
        label: "Existing name",
      },
    ],
  });

  try {
    expect(
      executeAction(editor, registry, entry.key, {
        targetKey: editor.read(() => $getRoot().getLastChild()!.getKey()),
      }).executed,
    ).toBe(true);
    expect(nativeOutput(editor, registry).blocks.at(-1)).toMatchObject({
      kind: "reference-code",
      config: { peer: "existing-name" },
    });
  } finally {
    editor.dispose();
  }
});
