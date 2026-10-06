import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { nativeSemanticEqual } from "../../src/forms/schema/semantics";
import pension from "../fixtures/forms/v2/pension.json";
import identity from "../fixtures/forms/v2/examples/passport-example.json";

for (const [name, form] of Object.entries({ pension, identity }))
  test(`${name}: native bindings survive the Markdown codec`, () => {
    const imported = formSchemaToLexical(form, govbbFormEditor);
    expect(imported.diagnostics).toEqual([]);
    expect(imported.status).toBe("ready");

    if (imported.status !== "ready") return;
    const markdown = lexicalToMarkdown(imported.state, govbbFormEditor);
    expect(markdown).not.toContain('"blocks": [\n      {\n        "id":');
    const parsed = markdownToLexical(markdown, govbbFormEditor);
    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.state).toBeDefined();

    if (!parsed.state) return;
    const editor = createHeadlessEditor(govbbFormEditor, parsed.state);

    try {
      const exported = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
      expect(exported.diagnostics).toEqual([]);
      expect(nativeSemanticEqual(exported.schema, form)).toBe(true);
    } finally {
      editor.dispose();
    }
  });

test("existing Markdown v2 upgrades once with stable bindings and retains the exact original for backup", async () => {
  const { govbbFormCodec } = await import("../../src/presets/govbb-form");

  const original = await readFile(
    new URL("../fixtures/forms/native-upgrade-v2.md", import.meta.url),
    "utf8",
  );

  const prepared = govbbFormCodec.prepare(original);
  expect(prepared.migrated).toBe(true);
  expect(prepared.migrationOriginal).toBe(original);
  const editor = createHeadlessEditor(govbbFormEditor, prepared.state);

  try {
    const exported = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
    expect(exported.diagnostics).toEqual([]);
    expect(exported.status).toBe("ready");
    const reloaded = govbbFormCodec.prepare(prepared.source);
    expect(reloaded.migrated).toBeUndefined();
    expect(reloaded.migrationOriginal).toBeUndefined();
    expect(reloaded.source).toBe(prepared.source);
    expect(reloaded.state).toEqual(prepared.state);
    expect(exported.schema?.blocks.find((block) => block.id === "name")).toMatchObject({
      key: "name",
      label: "Name",
    });
    expect(JSON.stringify(exported.schema)).toContain('"op":"add"');
  } finally {
    editor.dispose();
  }
});

test("legacy accumulator and unknown authoring properties remain editable without pretending they are native", async () => {
  const { govbbFormCodec } = await import("../../src/presets/govbb-form");

  const original = await readFile(
    new URL("../fixtures/forms/native-upgrade-v2.md", import.meta.url),
    "utf8",
  );

  for (const source of [
    original.replace(
      '"operator":"FORMULA","expression":"{{employees}} + 1"',
      '"operator":"ADDITION","value":1',
    ),
    original.replace('"logicalOperator":"AND"', '"opaque":false,"logicalOperator":"AND"'),
  ]) {
    const prepared = govbbFormCodec.prepare(source);
    expect(prepared.migrated).toBeUndefined();
    expect(prepared.diagnostics.some((issue) => issue.code === "native-preparation")).toBe(true);
    const editor = createHeadlessEditor(govbbFormEditor, prepared.state);

    try {
      expect(lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor).status).toBe(
        "blocked",
      );
    } finally {
      editor.dispose();
    }

    expect(prepared.source).toContain(
      source.includes('"ADDITION"') ? '"ADDITION"' : '"opaque": false',
    );
  }
});

test("native confirmation Markdown retains the form IDs and content", () => {
  const imported = formSchemaToLexical(identity, govbbFormEditor);

  if (imported.status !== "ready") throw new Error("Native fixture did not import");
  const canonical = lexicalToMarkdown(imported.state, govbbFormEditor);
  expect(canonical).toContain('type="confirmation"');
  const parsed = markdownToLexical(canonical, govbbFormEditor);
  expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);

  if (!parsed.state) throw new Error("Confirmation page did not import");
  const reopened = createHeadlessEditor(govbbFormEditor, parsed.state);

  try {
    const exported = lexicalToFormSchema(reopened.getEditorState(), govbbFormEditor, reopened);
    expect(exported.status).toBe("ready");
    expect(nativeSemanticEqual(exported.schema, identity)).toBe(true);
    expect(lexicalToMarkdown(reopened.getEditorState().toJSON(), govbbFormEditor)).toBe(canonical);
  } finally {
    reopened.dispose();
  }
});

test("unsupported native Markdown page types are rejected without changing the source or imported state", () => {
  const imported = formSchemaToLexical(identity, govbbFormEditor);

  if (imported.status !== "ready") throw new Error("Native fixture did not import");
  const canonical = lexicalToMarkdown(imported.state, govbbFormEditor);

  const original = canonical.replace(
    /^(::page\{[^\n}]*\btype=)"confirmation"/gm,
    '$1"unsupported-page"',
  );

  expect(original).not.toBe(canonical);
  const before = structuredClone(imported.state);
  const parsed = markdownToLexical(original, govbbFormEditor);
  expect(parsed.state).toBeUndefined();
  expect(parsed.document).toBeUndefined();
  expect(parsed.original).toBe(original);
  expect(parsed.diagnostics).toMatchObject([{ severity: "fatal", message: "Unknown page type" }]);
  expect(imported.state).toEqual(before);
});
